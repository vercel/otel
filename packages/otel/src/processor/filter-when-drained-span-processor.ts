import type { Context } from "@opentelemetry/api";
import type {
  Span,
  ReadableSpan,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { diag } from "@opentelemetry/api";
import { isDraining } from "../vercel-request-context/is-draining";

let reported = false;
const MAX_DRAINED_SPAN_KEYS = 10_000;

/** @internal */
export class FilterWhenDrainedSpanProcessor implements SpanProcessor {
  private readonly drainedSpanKeys = new Set<string>();

  constructor(private processor: SpanProcessor) {}

  forceFlush(): Promise<void> {
    return this.processor.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.processor.shutdown();
  }

  onStart(span: Span, parentContext: Context): void {
    if (isDraining()) {
      const spanKey = getSpanKey(span);
      if (this.drainedSpanKeys.size >= MAX_DRAINED_SPAN_KEYS) {
        const oldestSpanKey = this.drainedSpanKeys.values().next();
        if (!oldestSpanKey.done) {
          this.drainedSpanKeys.delete(oldestSpanKey.value);
        }
      }
      this.drainedSpanKeys.add(spanKey);
      if (!reported) {
        reported = true;
        diag.debug(
          "@vercel/otel: skipping automatic exporter due to configured trace drains",
        );
      }
      return;
    }
    this.processor.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    const spanKey = getSpanKey(span);
    if (this.drainedSpanKeys.delete(spanKey) || isDraining()) {
      return;
    }
    this.processor.onEnd(span);
  }
}

function getSpanKey(span: Span | ReadableSpan): string {
  const { traceId, spanId } = span.spanContext();
  return `${traceId}:${spanId}`;
}
