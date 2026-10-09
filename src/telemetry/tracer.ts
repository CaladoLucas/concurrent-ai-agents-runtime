import { randomUUID } from 'node:crypto';
import { SpanId, SpanStatus, TelemetrySpan, TraceId } from '../types/index.js';

/**
 * OpenTelemetry-compatible in-memory distributed tracer for concurrent agent execution.
 * Provides hierarchical span tracking, attribute recording, and timing diagnostics.
 */
export class OpenTelemetryTracer {
  private readonly traceId: TraceId;
  private readonly spans: Map<SpanId, TelemetrySpan> = new Map();
  private readonly activeSpans: Set<SpanId> = new Set();

  constructor(traceId?: TraceId) {
    this.traceId = traceId ?? randomUUID();
  }

  public getTraceId(): TraceId {
    return this.traceId;
  }

  /**
   * Starts a new span.
   */
  public startSpan(
    name: string,
    options?: {
      parentSpanId?: SpanId;
      attributes?: Record<string, string | number | boolean | undefined>;
      startTime?: number;
    }
  ): TelemetrySpan {
    const spanId = randomUUID().substring(0, 16);
    const span: TelemetrySpan = {
      traceId: this.traceId,
      spanId,
      parentSpanId: options?.parentSpanId,
      name,
      status: SpanStatus.UNSET,
      startTime: options?.startTime ?? Date.now(),
      attributes: { ...(options?.attributes ?? {}) },
      events: [],
    };

    this.spans.set(spanId, span);
    this.activeSpans.add(spanId);
    return span;
  }

  /**
   * Ends an active span, calculating its duration.
   */
  public endSpan(
    spanId: SpanId,
    status: SpanStatus = SpanStatus.OK,
    statusMessage?: string,
    endTime?: number
  ): TelemetrySpan {
    const span = this.spans.get(spanId);
    if (!span) {
      throw new Error(`Span with ID "${spanId}" not found in tracer "${this.traceId}".`);
    }

    const resolvedEnd = endTime ?? Date.now();
    span.endTime = resolvedEnd;
    span.durationMs = Math.max(0, resolvedEnd - span.startTime);
    span.status = status;
    if (statusMessage) {
      span.statusMessage = statusMessage;
    }

    this.activeSpans.delete(spanId);
    return span;
  }

  /**
   * Adds key-value attributes to an existing span.
   */
  public setAttribute(spanId: SpanId, key: string, value: string | number | boolean | undefined): void {
    const span = this.spans.get(spanId);
    if (span && value !== undefined) {
      span.attributes[key] = value;
    }
  }

  /**
   * Appends an event (log/milestone) to an existing span.
   */
  public addEvent(
    spanId: SpanId,
    eventName: string,
    attributes?: Record<string, string | number | boolean | undefined>
  ): void {
    const span = this.spans.get(spanId);
    if (span) {
      span.events.push({
        name: eventName,
        timestamp: Date.now(),
        attributes,
      });
    }
  }

  public getSpan(spanId: SpanId): TelemetrySpan | undefined {
    return this.spans.get(spanId);
  }

  public getAllSpans(): TelemetrySpan[] {
    return Array.from(this.spans.values()).sort((a, b) => a.startTime - b.startTime);
  }

  public getRootSpan(): TelemetrySpan | undefined {
    return Array.from(this.spans.values()).find((s) => !s.parentSpanId);
  }

  public getChildSpans(parentSpanId: SpanId): TelemetrySpan[] {
    return Array.from(this.spans.values()).filter((s) => s.parentSpanId === parentSpanId);
  }
}
