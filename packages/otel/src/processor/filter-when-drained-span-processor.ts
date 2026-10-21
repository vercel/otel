import type { Context } from "@opentelemetry/api";
import type {
  Span,
  ReadableSpan,
  SpanProcessor,
} from "@opentelemetry/sdk-trace";
import { diag } from "@opentelemetry/api";
import { isDraining } from "../vercel-request-context/is-draining";

let reported = false;

/** @internal */
export class FilterWhenDrainedSpanProcessor implements SpanProcessor {
  constructor(private processor: SpanProcessor) {}

  forceFlush(): Promise<void> {
    return this.processor.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.processor.shutdown();
  }

  onStart(span: Span, parentContext: Context): void {
    if (isDraining()) {
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

  onEnding(span: Span): void {
    if (isDraining()) {
      return;
    }
    this.processor.onEnding?.(span);
  }

  onEnd(span: ReadableSpan): void {
    if (isDraining()) {
      return;
    }
    this.processor.onEnd(span);
  }
}
