import type { Context } from "@opentelemetry/api";
import { TraceFlags, diag } from "@opentelemetry/api";
import type {
  Span,
  ReadableSpan,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { getVercelRequestContext } from "../vercel-request-context/api";
import { getVercelRequestContextAttributes } from "../vercel-request-context/attributes";

/** @internal */
export class CompositeSpanProcessor implements SpanProcessor {
  private readonly rootSpanIds = new Map<string, string>();
  private readonly waitSpanEnd = new Map<string, () => void>();

  constructor(private processors: SpanProcessor[]) {}

  forceFlush(): Promise<void> {
    return Promise.all(
      this.processors.map((p) =>
        p.forceFlush().catch((e) => {
          diag.error("@vercel/otel: forceFlush failed:", e);
        })
      )
    ).then(() => undefined);
  }

  shutdown(): Promise<void> {
    return Promise.all(
      this.processors.map((p) => p.shutdown().catch(() => undefined))
    ).then(() => undefined);
  }

  onStart(span: Span, parentContext: Context): void {
    const { traceId, spanId, traceFlags } = span.spanContext();
    const isRoot = !span.parentSpanId || !this.rootSpanIds.has(traceId);
    if (isRoot) {
      this.rootSpanIds.set(traceId, spanId);
    }
    if (isRoot && isSampled(traceFlags)) {
      const vercelRequestContextAttrs = getVercelRequestContextAttributes();
      if (vercelRequestContextAttrs) {
        span.setAttributes(vercelRequestContextAttrs);
      }

      // Flush the streams to avoid data loss.
      const vrc = getVercelRequestContext();
      if (vrc) {
        vrc.waitUntil(async () => {
          console.log(
            "QQQQ: waitUntil: pending? ",
            traceId,
            this.rootSpanIds.has(traceId)
          );
          if (this.rootSpanIds.has(traceId)) {
            // Not root has not completed yet, so no point in flushing.
            // Need to wait for onEnd.
            const promise = new Promise<void>((resolve) => {
              this.waitSpanEnd.set(traceId, resolve);
            });
            await Promise.race([
              promise,
              new Promise((resolve) => {
                setTimeout(() => {
                  console.log("QQQQ: waitUntil: timeout", traceId);
                  this.waitSpanEnd.delete(traceId);
                  resolve(undefined);
                }, 50);
              }),
            ]);
          }
          console.log("QQQQ: waitUntil: execute", traceId);
          return this.forceFlush();
        });
      }
    }

    for (const spanProcessor of this.processors) {
      spanProcessor.onStart(span, parentContext);
    }
  }

  onEnd(span: ReadableSpan): void {
    const { traceId, spanId } = span.spanContext();
    const isRoot = this.rootSpanIds.get(traceId) === spanId;

    for (const spanProcessor of this.processors) {
      spanProcessor.onEnd(span);
    }

    if (isRoot) {
      this.rootSpanIds.delete(traceId);
      const pending = this.waitSpanEnd.get(traceId);
      if (pending) {
        console.log("QQQQ: onEnd: resolve pending", traceId);
        this.waitSpanEnd.delete(traceId);
        pending();
      }
    }
  }
}

function isSampled(traceFlags: number): boolean {
  // eslint-disable-next-line no-bitwise
  return (traceFlags & TraceFlags.SAMPLED) !== 0;
}
