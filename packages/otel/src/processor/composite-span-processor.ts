import type { Attributes, Context } from "@opentelemetry/api";
import { diag, SpanKind } from "@opentelemetry/api";
import type {
  Span,
  ReadableSpan,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { getNumberFromEnv } from "@opentelemetry/core";
import {
  finalizeTrace,
  getVercelRequestContext,
  registerVercelRequestContextForTrace,
} from "../vercel-request-context/api";
import { getVercelRequestContextAttributes } from "../vercel-request-context/attributes";
import { isSampled } from "../util/sampled";
import type { AttributesFromHeaders } from "../types";

/** @internal */
export class CompositeSpanProcessor implements SpanProcessor {
  private readonly rootSpanIds = new Map<
    string,
    { rootSpanId: string; open: Span[] }
  >();
  private readonly waitSpanEnd = new Map<string, () => void>();

  private readonly flushBatchSize =
    getNumberFromEnv("OTEL_BSP_MAX_EXPORT_BATCH_SIZE") ?? 512;
  private readonly flushDelayMs =
    getNumberFromEnv("OTEL_BSP_SCHEDULE_DELAY") ?? 5000;
  private spansSinceFlush = 0;
  private lastFlushMs = 0;

  constructor(
    private processors: SpanProcessor[],
    private attributesFromHeaders: AttributesFromHeaders | undefined,
  ) {}

  forceFlush(): Promise<void> {
    return Promise.all(
      this.processors.map((p) =>
        p.forceFlush().catch((e) => {
          diag.error("@vercel/otel: forceFlush failed:", e);
        }),
      ),
    ).then(() => undefined);
  }

  shutdown(): Promise<void> {
    return Promise.all(
      this.processors.map((p) => p.shutdown().catch(() => undefined)),
    ).then(() => undefined);
  }

  onStart(span: Span, parentContext: Context): void {
    const { traceId, spanId, traceFlags } = span.spanContext();
    const isRoot =
      !span.parentSpanContext?.spanId || !this.rootSpanIds.has(traceId);
    if (isRoot) {
      this.rootSpanIds.set(traceId, { rootSpanId: spanId, open: [] });
    } else {
      this.rootSpanIds.get(traceId)?.open.push(span);
    }
    if (isRoot && isSampled(traceFlags)) {
      const vrc = getVercelRequestContext();
      const vercelRequestContextAttrs = getVercelRequestContextAttributes(
        vrc,
        this.attributesFromHeaders,
      );
      if (vercelRequestContextAttrs) {
        span.setAttributes(vercelRequestContextAttrs);
      }

      if (vrc) {
        // Capture the request context that owns this trace. The exporter
        // accumulates this trace's spans (mid-run flushes only drain the
        // BatchSpanProcessor's queue, they don't report) and ships them in a
        // single report when the trace is finalized below: the runtime only
        // reliably persists one report per invocation, and only through the
        // invocation's own telemetry channel.
        registerVercelRequestContextForTrace(traceId, vrc);

        // Flush the streams to avoid data loss.
        vrc.waitUntil(async () => {
          if (this.rootSpanIds.has(traceId)) {
            // Not root has not completed yet, so no point in flushing.
            // Need to wait for onEnd.
            const promise = new Promise<void>((resolve) => {
              this.waitSpanEnd.set(traceId, resolve);
            });
            let timer: NodeJS.Timeout | undefined;
            await Promise.race([
              promise,
              new Promise((resolve) => {
                timer = setTimeout(() => {
                  this.waitSpanEnd.delete(traceId);
                  resolve(undefined);
                }, 50);
              }),
            ]);
            if (timer) {
              clearTimeout(timer);
            }
          }
          try {
            // Drain the processors so every one of this trace's remaining
            // spans reaches the exporter's per-trace buffer...
            return await this.forceFlush();
          } finally {
            // ...then ship the buffer in one report and drop the captured
            // context.
            finalizeTrace(traceId);
          }
        });
      }
    }

    for (const spanProcessor of this.processors) {
      spanProcessor.onStart(span, parentContext);
    }
  }

  onEnd(span: ReadableSpan): void {
    const { traceId, spanId, traceFlags } = span.spanContext();
    const sampled = isSampled(traceFlags);
    const rootObj = this.rootSpanIds.get(traceId);
    const isRoot = rootObj?.rootSpanId === spanId;

    if (sampled) {
      const resourceAttributes = getResourceAttributes(span);
      if (resourceAttributes) {
        Object.assign(span.attributes, resourceAttributes);
      }
    }

    if (isRoot) {
      this.rootSpanIds.delete(traceId);
      if (rootObj.open.length > 0) {
        for (const openSpan of rootObj.open) {
          if (!openSpan.ended && openSpan.spanContext().spanId !== spanId) {
            try {
              openSpan.end();
            } catch (e) {
              diag.error("@vercel/otel: onEnd failed:", e);
            }
          }
        }
      }
    } else if (rootObj) {
      for (let i = 0; i < rootObj.open.length; i++) {
        if (rootObj.open[i]?.spanContext().spanId === spanId) {
          rootObj.open.splice(i, 1);
        }
      }
    }

    for (const spanProcessor of this.processors) {
      spanProcessor.onEnd(span);
    }

    if (isRoot) {
      const pending = this.waitSpanEnd.get(traceId);
      if (pending) {
        this.waitSpanEnd.delete(traceId);
        pending();
      }
    } else if (sampled && getVercelRequestContext()) {
      // Periodic drain, Vercel-only. Long-running invocations produce more
      // spans than the BatchSpanProcessor's queue holds (it silently drops
      // past maxQueueSize), so drain it regularly into the exporter's
      // per-trace buffers. Draining doesn't report anything: the trace's
      // spans ship in a single report at finalizeTrace. Off-Vercel this is
      // skipped and the stock timer behaves as before. The root span's final
      // flush is handled by the waitUntil registered in onStart.
      this.maybeFlush();
    }
  }

  private maybeFlush(): void {
    this.spansSinceFlush += 1;
    const now = Date.now();
    if (this.lastFlushMs === 0) {
      this.lastFlushMs = now;
    }
    if (
      this.spansSinceFlush >= this.flushBatchSize ||
      now - this.lastFlushMs >= this.flushDelayMs
    ) {
      this.spansSinceFlush = 0;
      this.lastFlushMs = now;
      void this.forceFlush().catch((e) => {
        diag.error("@vercel/otel: periodic flush failed:", e);
      });
    }
  }
}

const SPAN_KIND_NAME: { [key in SpanKind]: string } = {
  [SpanKind.INTERNAL]: "internal",
  [SpanKind.SERVER]: "server",
  [SpanKind.CLIENT]: "client",
  [SpanKind.PRODUCER]: "producer",
  [SpanKind.CONSUMER]: "consumer",
};

function getResourceAttributes(span: ReadableSpan): Attributes | undefined {
  const { kind, attributes } = span;
  const {
    "operation.name": operationName,
    "resource.name": resourceName,
    "span.type": spanTypeAttr,
    "next.span_type": nextSpanType,
    "http.method": httpMethod,
    "http.route": httpRoute,
  } = attributes;
  if (operationName) {
    return undefined;
  }

  const resourceNameResolved =
    resourceName ??
    (httpMethod &&
    typeof httpMethod === "string" &&
    httpRoute &&
    typeof httpRoute === "string"
      ? `${httpMethod} ${httpRoute}`
      : httpRoute);

  if (
    span.kind === SpanKind.SERVER &&
    httpMethod &&
    httpRoute &&
    typeof httpMethod === "string" &&
    typeof httpRoute === "string"
  ) {
    return {
      "operation.name": "web.request",
      "resource.name": resourceNameResolved,
    };
  }

  // Per https://github.com/DataDog/datadog-agent/blob/main/pkg/config/config_template.yaml,
  // the default operation.name is "library name + span kind".
  const libraryName = span.instrumentationScope.name;
  const spanType = nextSpanType ?? spanTypeAttr;
  if (spanType && typeof spanType === "string") {
    const nextOperationName = toOperationName(libraryName, spanType);
    if (httpRoute) {
      return {
        "operation.name": nextOperationName,
        "resource.name": resourceNameResolved,
      };
    }
    return { "operation.name": nextOperationName };
  }

  return {
    "operation.name": toOperationName(
      libraryName,
      kind === SpanKind.INTERNAL ? "" : SPAN_KIND_NAME[kind],
    ),
  };
}

function toOperationName(libraryName: string, name: string): string {
  if (!libraryName) {
    return name;
  }
  let cleanLibraryName = libraryName.replace(/[ @./]/g, "_");
  if (cleanLibraryName.startsWith("_")) {
    cleanLibraryName = cleanLibraryName.slice(1);
  }
  return name ? `${cleanLibraryName}.${name}` : cleanLibraryName;
}
