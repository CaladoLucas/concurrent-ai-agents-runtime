import pc from 'picocolors';
import { OpenTelemetryTracer } from './tracer.js';

/**
 * Visualizes concurrent agent execution spans as an ASCII Gantt chart timeline.
 */
export class TelemetryTimelineVisualizer {
  public static renderAsciiTimeline(tracer: OpenTelemetryTracer, width = 60): string {
    const spans = tracer
      .getAllSpans()
      .filter((s) => s.attributes['type'] === 'agent_execution' || s.parentSpanId)
      .sort((a, b) => a.startTime - b.startTime);

    if (spans.length === 0) {
      return 'No agent execution spans recorded.';
    }

    const minTime = Math.min(...spans.map((s) => s.startTime));
    const maxTime = Math.max(...spans.map((s) => s.endTime ?? s.startTime));
    const totalDuration = Math.max(1, maxTime - minTime);

    const maxNameLen = Math.max(...spans.map((s) => s.name.length), 20);
    const lines: string[] = [];

    lines.push(pc.bold(pc.cyan('=== CONCURRENT AGENT EXECUTION TIMELINE (GANTT) ===')));
    lines.push(
      pc.dim(
        `Total Wall-Clock Time: ${totalDuration}ms | Base Timestamp: ${new Date(minTime).toISOString().slice(11, 23)}`
      )
    );
    lines.push('─'.repeat(maxNameLen + width + 18));

    for (const span of spans) {
      const startOffset = span.startTime - minTime;
      const duration = span.durationMs ?? 0;

      const startCol = Math.min(width - 1, Math.floor((startOffset / totalDuration) * width));
      const spanCols = Math.max(1, Math.min(width - startCol, Math.round((duration / totalDuration) * width)));

      const leadingSpaces = ' '.repeat(startCol);
      const barChars = '█'.repeat(spanCols);
      const trailingSpaces = ' '.repeat(Math.max(0, width - startCol - spanCols));

      const namePadded = span.name.padEnd(maxNameLen);
      const durationStr = `${duration}ms`.padStart(7);
      const tokensStr = span.attributes['tokens.total']
        ? `${span.attributes['tokens.total']} tok`
        : '';

      const isFanOut = span.attributes['phase'] === 'fan_out';
      const isFanIn = span.attributes['phase'] === 'fan_in';

      let coloredBar: string;
      if (isFanOut) {
        coloredBar = pc.green(barChars);
      } else if (isFanIn) {
        coloredBar = pc.magenta(barChars);
      } else {
        coloredBar = pc.blue(barChars);
      }

      lines.push(
        `${pc.bold(namePadded)} │${leadingSpaces}${coloredBar}${trailingSpaces}│ ${pc.yellow(durationStr)} ${pc.dim(tokensStr)}`
      );
    }

    lines.push('─'.repeat(maxNameLen + width + 18));
    lines.push(
      `Legend: ${pc.green('█ Fan-Out (Parallel)')}  ${pc.magenta('█ Fan-In (Aggregation)')}  ${pc.blue('█ Sequential/Root')}`
    );

    return lines.join('\n');
  }
}
