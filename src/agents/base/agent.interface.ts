import { AgentMetadata, NodeId, RetryPolicy, TokenUsage, TraceId } from '../../types/index.js';
import { OpenTelemetryTracer } from '../../telemetry/tracer.js';

export interface AgentLogger {
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  debug?: (message: string, ...args: unknown[]) => void;
}

export interface AgentContext {
  runId: string;
  traceId: TraceId;
  nodeId: NodeId;
  tracer: OpenTelemetryTracer;
  dependencyOutputs: Map<NodeId, unknown>;
  signal?: AbortSignal;
  logger: AgentLogger;
}

export interface AgentExecutionResult<TOutput> {
  success: boolean;
  data: TOutput;
  tokenUsage: TokenUsage;
  executionTimeMs: number;
  metadata?: Record<string, unknown>;
}

export interface IAgent<TInput = any, TOutput = any> {
  readonly metadata: AgentMetadata;
  readonly retryPolicy?: Partial<RetryPolicy>;
  initialize(context: AgentContext): Promise<void>;
  execute(input: TInput, context: AgentContext): Promise<AgentExecutionResult<TOutput>>;
  cleanup(context: AgentContext): Promise<void>;
}
