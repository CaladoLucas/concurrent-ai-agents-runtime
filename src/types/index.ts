/**
 * Core type definitions for Concurrent AI Agents Runtime.
 *
 * @author Lucas Calado <lucascalado@gmail.com>
 */

export type NodeId = string;
export type TraceId = string;
export type SpanId = string;
export type TaskId = string;

export enum NodeStatus {
  IDLE = 'IDLE',
  PENDING = 'PENDING',
  READY = 'READY',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

export enum SpanStatus {
  UNSET = 'UNSET',
  OK = 'OK',
  ERROR = 'ERROR',
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface RetryPolicy {
  maxRetries: number;
  initialDelayMs: number;
  backoffFactor: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  initialDelayMs: 100,
  backoffFactor: 2,
  maxDelayMs: 2000,
};

export interface AgentMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  tags?: string[];
}

export interface TelemetrySpan {
  traceId: TraceId;
  spanId: SpanId;
  parentSpanId?: SpanId;
  name: string;
  status: SpanStatus;
  statusMessage?: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  attributes: Record<string, string | number | boolean | undefined>;
  events: Array<{
    name: string;
    timestamp: number;
    attributes?: Record<string, string | number | boolean | undefined>;
  }>;
}

export interface WorkerPoolOptions {
  maxConcurrency: number;
  highWaterMark?: number;
  drainTimeoutMs?: number;
}

export interface WorkerTask<T = unknown> {
  id: TaskId;
  priority?: number;
  execute: () => Promise<T>;
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
}

export interface DAGNodeOptions<TInput = unknown> {
  id: NodeId;
  name: string;
  dependencies?: NodeId[];
  retryPolicy?: Partial<RetryPolicy>;
  timeoutMs?: number;
  inputSelector?: (contextOutputs: Map<NodeId, unknown>) => TInput;
}

export interface ExecutionMetrics {
  traceId: TraceId;
  wallClockDurationMs: number;
  sequentialCumulativeMs: number;
  timeSavedMs: number;
  speedupFactor: number;
  concurrencyLevel: number;
  totalNodes: number;
  completedNodes: number;
  failedNodes: number;
  tokenUsage: TokenUsage;
}
