import { describe, expect, it } from 'vitest';
import { OpenTelemetryTracer } from '../src/telemetry/tracer.js';
import { TelemetryMetricsCollector } from '../src/telemetry/metrics.js';
import { TelemetryTimelineVisualizer } from '../src/telemetry/timeline.js';
import { SpanStatus } from '../src/types/index.js';

describe('Telemetry & Observability - Tracing, Spans, Metrics and Gantt', () => {
  it('should manage spans with parent-child relationships and attributes', () => {
    const tracer = new OpenTelemetryTracer();
    const rootSpan = tracer.startSpan('root.workflow');
    expect(rootSpan.status).toBe(SpanStatus.UNSET);

    const childSpan = tracer.startSpan('child.agent', {
      parentSpanId: rootSpan.spanId,
      attributes: { 'tokens.prompt': 100, 'tokens.completion': 50 },
    });

    tracer.setAttribute(childSpan.spanId, 'tokens.total', 150);
    tracer.addEvent(childSpan.spanId, 'checkpoint_reached', { step: 1 });
    tracer.endSpan(childSpan.spanId, SpanStatus.OK);

    expect(childSpan.status).toBe(SpanStatus.OK);
    expect(childSpan.durationMs).toBeGreaterThanOrEqual(0);
    expect(childSpan.attributes['tokens.total']).toBe(150);
    expect(childSpan.events.length).toBe(1);

    tracer.endSpan(rootSpan.spanId, SpanStatus.OK);

    const spans = tracer.getAllSpans();
    expect(spans.length).toBe(2);
    expect(tracer.getChildSpans(rootSpan.spanId).length).toBe(1);
  });

  it('should compute metrics calculating wall-clock duration, time saved, and tokens', () => {
    const tracer = new OpenTelemetryTracer();
    const baseTime = 1000;

    // Simulate 2 parallel spans of 100ms each
    const span1 = tracer.startSpan('agent1', { startTime: baseTime });
    tracer.setAttribute(span1.spanId, 'type', 'agent_execution');
    tracer.setAttribute(span1.spanId, 'tokens.prompt', 100);
    tracer.setAttribute(span1.spanId, 'tokens.completion', 100);
    tracer.endSpan(span1.spanId, SpanStatus.OK, undefined, baseTime + 100);

    const span2 = tracer.startSpan('agent2', { startTime: baseTime });
    tracer.setAttribute(span2.spanId, 'type', 'agent_execution');
    tracer.setAttribute(span2.spanId, 'tokens.prompt', 150);
    tracer.setAttribute(span2.spanId, 'tokens.completion', 50);
    tracer.endSpan(span2.spanId, SpanStatus.OK, undefined, baseTime + 100);

    const metrics = TelemetryMetricsCollector.computeMetrics(tracer, 2, 2, 0, 2);

    expect(metrics.wallClockDurationMs).toBe(100);
    expect(metrics.sequentialCumulativeMs).toBe(200);
    expect(metrics.timeSavedMs).toBe(100);
    expect(metrics.speedupFactor).toBe(2);
    expect(metrics.tokenUsage.totalTokens).toBe(400);
  });

  it('should render ASCII Gantt timeline correctly', () => {
    const tracer = new OpenTelemetryTracer();
    const s1 = tracer.startSpan('Extractor', { attributes: { type: 'agent_execution', phase: 'standard' } });
    tracer.endSpan(s1.spanId, SpanStatus.OK);

    const s2 = tracer.startSpan('Auditor', { attributes: { type: 'agent_execution', phase: 'fan_out' } });
    tracer.endSpan(s2.spanId, SpanStatus.OK);

    const ascii = TelemetryTimelineVisualizer.renderAsciiTimeline(tracer);
    expect(ascii).toContain('CONCURRENT AGENT EXECUTION TIMELINE');
    expect(ascii).toContain('Extractor');
    expect(ascii).toContain('Auditor');
  });
});
