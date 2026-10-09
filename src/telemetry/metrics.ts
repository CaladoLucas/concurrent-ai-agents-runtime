import { ExecutionMetrics, TokenUsage } from '../types/index.js';
import { OpenTelemetryTracer } from './tracer.js';

/**
 * Computes comparative execution metrics from distributed tracer spans,
 * measuring wall-clock duration, cumulative sequential duration, speedup factor,
 * and aggregated token utilization.
 */
export class TelemetryMetricsCollector {
  public static computeMetrics(
    tracer: OpenTelemetryTracer,
    totalNodes: number,
    completedNodes: number,
    failedNodes: number,
    concurrencyLevel: number
  ): ExecutionMetrics {
    const spans = tracer.getAllSpans();

    if (spans.length === 0) {
      return {
        traceId: tracer.getTraceId(),
        wallClockDurationMs: 0,
        sequentialCumulativeMs: 0,
        timeSavedMs: 0,
        speedupFactor: 1.0,
        concurrencyLevel,
        totalNodes,
        completedNodes,
        failedNodes,
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }

    // Min start time and max end time across all recorded spans
    const minStart = Math.min(...spans.map((s) => s.startTime));
    const maxEnd = Math.max(...spans.map((s) => s.endTime ?? s.startTime));
    const wallClockDurationMs = Math.max(1, maxEnd - minStart);

    // Sum of durations of all node-level agent executions (excluding root span)
    const agentSpans = spans.filter((s) => s.attributes['type'] === 'agent_execution' || s.parentSpanId);
    const candidateSpans = agentSpans.length > 0 ? agentSpans : spans;

    const sequentialCumulativeMs = candidateSpans.reduce((acc, s) => acc + (s.durationMs ?? 0), 0);
    const timeSavedMs = Math.max(0, sequentialCumulativeMs - wallClockDurationMs);
    const speedupFactor = Number((sequentialCumulativeMs / wallClockDurationMs).toFixed(2));

    // Aggregate token metrics from span attributes
    const tokenUsage: TokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    for (const span of candidateSpans) {
      const prompt = Number(span.attributes['tokens.prompt'] ?? 0);
      const completion = Number(span.attributes['tokens.completion'] ?? 0);
      const total = Number(span.attributes['tokens.total'] ?? (prompt + completion));

      tokenUsage.promptTokens += prompt;
      tokenUsage.completionTokens += completion;
      tokenUsage.totalTokens += total;
    }

    return {
      traceId: tracer.getTraceId(),
      wallClockDurationMs,
      sequentialCumulativeMs,
      timeSavedMs,
      speedupFactor: Math.max(1.0, speedupFactor),
      concurrencyLevel,
      totalNodes,
      completedNodes,
      failedNodes,
      tokenUsage,
    };
  }
}
