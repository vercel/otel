import type { Context } from "@opentelemetry/api";
import type {
  Span,
  ReadableSpan,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { diag } from "@opentelemetry/api";
import { getVercelRequestContext } from "../vercel-request-context/api";

let reported = false;

function isExportingViaVercel(): boolean {
  return Boolean(getVercelRequestContext()?.telemetry);
}

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
    if (isExportingViaVercel()) {
      if (!reported) {
        reported = true;
        diag.debug(
          "@vercel/otel: skipping automatic exporter because the Vercel request context is exporting spans",
        );
      }
      return;
    }
    this.processor.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    if (isExportingViaVercel()) {
      return;
    }
    this.processor.onEnd(span);
  }
}
