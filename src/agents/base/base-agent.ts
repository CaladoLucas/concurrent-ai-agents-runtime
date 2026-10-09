import { ZodType } from 'zod';
import {
  AgentMetadata,
  DEFAULT_RETRY_POLICY,
  RetryPolicy,
  SpanStatus,
  TokenUsage,
} from '../../types/index.js';
import {
  AgentContext,
  AgentExecutionResult,
  IAgent,
} from './agent.interface.js';

export interface BaseAgentConfig<TInput, TOutput> {
  metadata: AgentMetadata;
  retryPolicy?: Partial<RetryPolicy>;
  timeoutMs?: number;
  inputSchema?: ZodType<TInput>;
  outputSchema?: ZodType<TOutput>;
}

/**
 * Abstract Base Agent with standardized lifecycle, runtime schema validation,
 * exponential backoff retry mechanisms, and OpenTelemetry instrumentation.
 */
export abstract class BaseAgent<TInput = any, TOutput = any> implements IAgent<TInput, TOutput> {
  public readonly metadata: AgentMetadata;
  public readonly retryPolicy: RetryPolicy;
  public readonly timeoutMs?: number;
  protected readonly inputSchema?: ZodType<TInput>;
  protected readonly outputSchema?: ZodType<TOutput>;

  constructor(config: BaseAgentConfig<TInput, TOutput>) {
    this.metadata = config.metadata;
    this.retryPolicy = {
      ...DEFAULT_RETRY_POLICY,
      ...(config.retryPolicy ?? {}),
    };
    this.timeoutMs = config.timeoutMs;
    this.inputSchema = config.inputSchema;
    this.outputSchema = config.outputSchema;
  }

  /**
   * Lifecycle hook: invoked once before agent execution.
   */
  public async initialize(context: AgentContext): Promise<void> {
    context.logger.debug?.(`[Agent:${this.metadata.name}] Initializing...`);
  }

  /**
   * Lifecycle hook: invoked once after agent execution.
   */
  public async cleanup(context: AgentContext): Promise<void> {
    context.logger.debug?.(`[Agent:${this.metadata.name}] Cleaning up...`);
  }

  /**
   * Domain-specific execution logic implemented by specialized agents.
   */
  protected abstract process(
    input: TInput,
    context: AgentContext
  ): Promise<{
    data: TOutput;
    tokenUsage: TokenUsage;
    metadata?: Record<string, unknown>;
  }>;

  /**
   * Public execution orchestrator with validation, retry loop, and telemetry spans.
   */
  public async execute(input: TInput, context: AgentContext): Promise<AgentExecutionResult<TOutput>> {
    const startTime = Date.now();
    const span = context.tracer.startSpan(`agent.${this.metadata.name}`, {
      attributes: {
        type: 'agent_execution',
        'agent.id': this.metadata.id,
        'agent.name': this.metadata.name,
        'agent.version': this.metadata.version,
        'node.id': context.nodeId,
      },
    });

    try {
      // 1. Input Schema Validation
      let validatedInput = input;
      if (this.inputSchema) {
        const validation = this.inputSchema.safeParse(input);
        if (!validation.success) {
          throw new Error(
            `Input validation failed for agent "${this.metadata.name}": ${validation.error.message}`
          );
        }
        validatedInput = validation.data;
      }

      // 2. Execution with Retry Loop & Timeout
      let attempts = 0;
      let lastError: Error | undefined;

      while (attempts <= this.retryPolicy.maxRetries) {
        attempts++;
        try {
          if (attempts > 1) {
            context.logger.warn(
              `[Agent:${this.metadata.name}] Retry attempt ${attempts - 1}/${this.retryPolicy.maxRetries}...`
            );
            context.tracer.addEvent(span.spanId, 'agent_retry_attempt', {
              attempt: attempts - 1,
            });
          }

          const executionPromise = this.process(validatedInput, context);
          const result = this.timeoutMs
            ? await this.withTimeout(executionPromise, this.timeoutMs)
            : await executionPromise;

          // 3. Output Schema Validation
          let validatedOutput = result.data;
          if (this.outputSchema) {
            const outValidation = this.outputSchema.safeParse(result.data);
            if (!outValidation.success) {
              throw new Error(
                `Output validation failed for agent "${this.metadata.name}": ${outValidation.error.message}`
              );
            }
            validatedOutput = outValidation.data;
          }

          const executionTimeMs = Date.now() - startTime;

          // 4. Record telemetry attributes
          context.tracer.setAttribute(span.spanId, 'tokens.prompt', result.tokenUsage.promptTokens);
          context.tracer.setAttribute(span.spanId, 'tokens.completion', result.tokenUsage.completionTokens);
          context.tracer.setAttribute(span.spanId, 'tokens.total', result.tokenUsage.totalTokens);
          context.tracer.setAttribute(span.spanId, 'agent.attempts', attempts);
          context.tracer.endSpan(span.spanId, SpanStatus.OK);

          return {
            success: true,
            data: validatedOutput,
            tokenUsage: result.tokenUsage,
            executionTimeMs,
            metadata: result.metadata,
          };
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          if (attempts <= this.retryPolicy.maxRetries) {
            const delay = Math.min(
              this.retryPolicy.maxDelayMs,
              this.retryPolicy.initialDelayMs * Math.pow(this.retryPolicy.backoffFactor, attempts - 1)
            );
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }

      throw lastError ?? new Error(`Execution failed after ${attempts} attempts`);
    } catch (finalError) {
      const err = finalError instanceof Error ? finalError : new Error(String(finalError));
      context.tracer.endSpan(span.spanId, SpanStatus.ERROR, err.message);
      throw err;
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Agent "${this.metadata.name}" execution timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      promise
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
