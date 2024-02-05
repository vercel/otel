import type { Attributes, Context } from "@opentelemetry/api";
import { TraceFlags, diag, SpanKind } from "@opentelemetry/api";
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

    const resourceAttributes = getResourceAttributes(span);
    if (resourceAttributes) {
      Object.assign(span.attributes, resourceAttributes);
    }

    for (const spanProcessor of this.processors) {
      spanProcessor.onEnd(span);
    }

    if (isRoot) {
      this.rootSpanIds.delete(traceId);
      const pending = this.waitSpanEnd.get(traceId);
      if (pending) {
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
    "resouce.name": resourceName,
    "span.type": spanTypeAttr,
    "next.span_type": nextSpanType,
    "http.method": httpMethod,
    "http.route": httpRoute,
  } = attributes;
  if (operationName) {
    return undefined;
  }

  // Per https://github.com/DataDog/datadog-agent/blob/main/pkg/config/config_template.yaml,
  // the default operation.name is "library name + span kind".
  const libraryName = span.instrumentationLibrary.name;

  const spanType = nextSpanType ?? spanTypeAttr;
  if (spanType && typeof spanType === "string") {
    return {
      "operation.name": toOperationName(libraryName, spanType),
    };
  }

  if (
    httpMethod &&
    httpRoute &&
    typeof httpMethod === "string" &&
    typeof httpRoute === "string"
  ) {
    return {
      "operation.name": toOperationName(
        libraryName,
        `http.${SPAN_KIND_NAME[kind] || "internal"}.request`
      ),
      "resource.name": resourceName ?? `${httpMethod} ${httpRoute}`,
    };
  }

  return {
    "operation.name": toOperationName(
      libraryName,
      SPAN_KIND_NAME[kind] || "internal"
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
  return `${cleanLibraryName}.${name}`;
}
