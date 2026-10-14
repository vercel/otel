import type { Attributes, Context } from "@opentelemetry/api";
import { diag, SpanKind, trace } from "@opentelemetry/api";
import type {
  Span,
  ReadableSpan,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { getVercelRequestContext } from "../vercel-request-context/api";
import { getVercelRequestContextAttributes } from "../vercel-request-context/attributes";
import { isSampled } from "../util/sampled";
import type { AttributesFromHeaders } from "../types";

/**
 * The first span a request starts in this process, and the spans opened under
 * it. Concurrent requests can continue the same trace, so this is tracked per
 * request, not per trace.
 */
interface LocalRoot {
  rootSpanId: string;
  open: Span[];
  ended: boolean;
}

/** @internal */
export class CompositeSpanProcessor implements SpanProcessor {
  // Maps each span to its request's local root; entries are collected with
  // their spans.
  private readonly localRoots = new WeakMap<object, LocalRoot>();
  private readonly waitSpanEnd = new Map<string, () => void>();

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
    const { spanId, traceFlags } = span.spanContext();
    // A span joins its local parent's request; a span with a remote or no
    // parent starts a new one.
    const parentSpan =
      span.parentSpanContext && !span.parentSpanContext.isRemote
        ? trace.getSpan(parentContext)
        : undefined;
    const parentRoot = parentSpan && this.localRoots.get(parentSpan);
    const isRoot = !parentRoot || parentRoot.ended;
    const localRoot = isRoot
      ? { rootSpanId: spanId, open: [], ended: false }
      : parentRoot;
    this.localRoots.set(span, localRoot);
    if (!isRoot) {
      localRoot.open.push(span);
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

      // Flush the streams to avoid data loss.
      if (vrc) {
        vrc.waitUntil(async () => {
          if (!localRoot.ended) {
            // Not root has not completed yet, so no point in flushing.
            // Need to wait for onEnd.
            const promise = new Promise<void>((resolve) => {
              this.waitSpanEnd.set(spanId, resolve);
            });
            let timer: NodeJS.Timeout | undefined;
            await Promise.race([
              promise,
              new Promise((resolve) => {
                timer = setTimeout(() => {
                  this.waitSpanEnd.delete(spanId);
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
    const { spanId, traceFlags } = span.spanContext();
    const sampled = isSampled(traceFlags);
    const rootObj = this.localRoots.get(span);
    const isRoot = rootObj?.rootSpanId === spanId;

    if (sampled) {
      const resourceAttributes = getResourceAttributes(span);
      if (resourceAttributes) {
        Object.assign(span.attributes, resourceAttributes);
      }
    }

    if (isRoot) {
      rootObj.ended = true;
      const open = rootObj.open;
      rootObj.open = [];
      if (open.length > 0) {
        for (const openSpan of open) {
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
      const pending = this.waitSpanEnd.get(spanId);
      if (pending) {
        this.waitSpanEnd.delete(spanId);
        pending();
      }
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
