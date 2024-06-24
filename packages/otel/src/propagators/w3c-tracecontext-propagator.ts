import {
  createTraceState,
  isSpanContextValid,
  trace as traceApi,
} from "@opentelemetry/api";
import type {
  Context,
  SpanContext,
  TextMapGetter,
  TextMapPropagator,
  TextMapSetter,
} from "@opentelemetry/api";
import { isTracingSuppressed } from "@opentelemetry/core";

const VERSION = "00";

const TRACE_PARENT_HEADER = "traceparent";
const TRACE_STATE_HEADER = "tracestate";

/**
 * Same as the `W3CTraceContextPropagator` from `@opentelemetry/core`, but with
 * a workaround for RegExp issue in Edge.
 */
export class W3CTraceContextPropagator implements TextMapPropagator {
  fields(): string[] {
    return [TRACE_PARENT_HEADER, TRACE_STATE_HEADER];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inject(context: Context, carrier: any, setter: TextMapSetter): void {
    const spanContext = traceApi.getSpanContext(context);
    if (
      !spanContext ||
      isTracingSuppressed(context) ||
      !isSpanContextValid(spanContext)
    )
      return;

    const traceParent = `${VERSION}-${spanContext.traceId}-${
      spanContext.spanId
    }-0${Number(spanContext.traceFlags || 0).toString(16)}`;

    setter.set(carrier, TRACE_PARENT_HEADER, traceParent);
    if (spanContext.traceState) {
      setter.set(
        carrier,
        TRACE_STATE_HEADER,
        spanContext.traceState.serialize()
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extract(context: Context, carrier: any, getter: TextMapGetter): Context {
    const traceParentHeader = getter.get(carrier, TRACE_PARENT_HEADER);
    if (!traceParentHeader) return context;
    const traceParent = Array.isArray(traceParentHeader)
      ? traceParentHeader[0]
      : traceParentHeader;
    if (typeof traceParent !== "string") return context;
    const spanContext = parseTraceParent(traceParent);
    if (!spanContext) return context;

    spanContext.isRemote = true;

    const traceStateHeader = getter.get(carrier, TRACE_STATE_HEADER);
    if (traceStateHeader) {
      // If more than one `tracestate` header is found, we merge them into a
      // single header.
      const state = Array.isArray(traceStateHeader)
        ? traceStateHeader.join(",")
        : traceStateHeader;
      spanContext.traceState = createTraceState(
        typeof state === "string" ? state : undefined
      );
    }
    return traceApi.setSpanContext(context, spanContext);
  }
}

function parseTraceParent(traceParent: string): SpanContext | null {
  const [version, traceId, spanId, traceFlags, other] = traceParent.split("-");
  if (
    !version ||
    !traceId ||
    !spanId ||
    !traceFlags ||
    version.length !== 2 ||
    traceId.length !== 32 ||
    spanId.length !== 16 ||
    traceFlags.length !== 2
  )
    return null;

  // According to the specification the implementation should be compatible
  // with future versions. If there are more parts, we only reject it if it's using version 00
  // See https://www.w3.org/TR/trace-context/#versioning-of-traceparent
  if (version === "00" && other) return null;

  return {
    traceId,
    spanId,
    traceFlags: parseInt(traceFlags, 16),
  };
}
