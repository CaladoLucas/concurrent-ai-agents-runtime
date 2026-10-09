import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AgentContext } from '../src/agents/base/agent.interface.js';
import { BaseAgent } from '../src/agents/base/base-agent.js';
import { OpenTelemetryTracer } from '../src/telemetry/tracer.js';

const DummyInputSchema = z.object({
  query: z.string(),
  amount: z.number().positive(),
});

const DummyOutputSchema = z.object({
  status: z.enum(['SUCCESS', 'FAILED']),
  score: z.number(),
});

function createTestContext(): AgentContext {
  return {
    runId: 'test-run',
    traceId: 'test-trace',
    nodeId: 'test-node',
    tracer: new OpenTelemetryTracer('test-trace'),
    dependencyOutputs: new Map(),
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };
}

describe('Base Agent - Lifecycle, Validation, Retries and Timeouts', () => {
  it('should validate inputs and outputs successfully against Zod schemas', async () => {
    class ValidatingAgent extends BaseAgent<z.infer<typeof DummyInputSchema>, z.infer<typeof DummyOutputSchema>> {
      constructor() {
        super({
          metadata: {
            id: 'test.validator',
            name: 'ValidatorAgent',
            version: '1.0.0',
            description: 'Validates schemas',
          },
          inputSchema: DummyInputSchema,
          outputSchema: DummyOutputSchema,
        });
      }

      protected async process(input: z.infer<typeof DummyInputSchema>) {
        return {
          data: { status: 'SUCCESS' as const, score: input.amount * 2 },
          tokenUsage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        };
      }
    }

    const agent = new ValidatingAgent();
    const ctx = createTestContext();

    const result = await agent.execute({ query: 'check balance', amount: 50 }, ctx);
    expect(result.success).toBe(true);
    expect(result.data.score).toBe(100);
    expect(result.tokenUsage.totalTokens).toBe(10);
  });

  it('should reject invalid input data according to inputSchema', async () => {
    class ValidatingAgent extends BaseAgent<z.infer<typeof DummyInputSchema>, any> {
      constructor() {
        super({
          metadata: { id: 'test.val', name: 'Val', version: '1.0.0', description: 'desc' },
          inputSchema: DummyInputSchema,
        });
      }
      protected async process() {
        return { data: {}, tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
      }
    }

    const agent = new ValidatingAgent();
    const ctx = createTestContext();

    // Amount is negative, violating positive()
    await expect(agent.execute({ query: 'test', amount: -10 } as any, ctx)).rejects.toThrow(
      /Input validation failed/i
    );
  });

  it('should recover from transient failures using retry policy with backoff', async () => {
    let callAttempts = 0;

    class FlakyAgent extends BaseAgent<{ attemptTarget: number }, { success: boolean }> {
      constructor() {
        super({
          metadata: { id: 'test.flaky', name: 'FlakyAgent', version: '1.0.0', description: 'Flaky' },
          retryPolicy: {
            maxRetries: 3,
            initialDelayMs: 10,
            backoffFactor: 1.5,
            maxDelayMs: 100,
          },
        });
      }

      protected async process(input: { attemptTarget: number }) {
        callAttempts++;
        if (callAttempts < input.attemptTarget) {
          throw new Error(`Transient API failure on attempt ${callAttempts}`);
        }
        return {
          data: { success: true },
          tokenUsage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        };
      }
    }

    const agent = new FlakyAgent();
    const ctx = createTestContext();

    // Fails twice, succeeds on attempt 3
    const result = await agent.execute({ attemptTarget: 3 }, ctx);
    expect(result.success).toBe(true);
    expect(callAttempts).toBe(3);
  });

  it('should fail and re-throw when max retries are exhausted', async () => {
    class FailingAgent extends BaseAgent<any, any> {
      constructor() {
        super({
          metadata: { id: 'test.failing', name: 'FailingAgent', version: '1.0.0', description: 'Fails' },
          retryPolicy: { maxRetries: 2, initialDelayMs: 5, backoffFactor: 1, maxDelayMs: 10 },
        });
      }
      protected async process() {
        throw new Error('Persistent external failure');
      }
    }

    const agent = new FailingAgent();
    const ctx = createTestContext();

    await expect(agent.execute({}, ctx)).rejects.toThrow('Persistent external failure');
  });

  it('should abort and reject when agent execution exceeds timeout limit', async () => {
    class SlowAgent extends BaseAgent<any, any> {
      constructor() {
        super({
          metadata: { id: 'test.slow', name: 'SlowAgent', version: '1.0.0', description: 'Slow' },
          timeoutMs: 40,
        });
      }
      protected async process() {
        await new Promise((r) => setTimeout(r, 100));
        return { data: {}, tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
      }
    }

    const agent = new SlowAgent();
    const ctx = createTestContext();

    await expect(agent.execute({}, ctx)).rejects.toThrow(/timed out after 40ms/i);
  });
});
