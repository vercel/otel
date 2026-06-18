import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import type {
  Fixed64,
  OtlpEncodingOptions,
} from "@opentelemetry/otlp-transformer/build/src/common/internal-types";
import { createExportTraceServiceRequest } from "@opentelemetry/otlp-transformer/build/src/trace/internal";
import type {
  IExportTraceServiceRequest,
  ISpan,
} from "@opentelemetry/otlp-transformer/build/src/trace/internal-types";

export function createTraceServiceRequest(
  spans: ReadableSpan[],
  options?: OtlpEncodingOptions,
): IExportTraceServiceRequest {
  const request = createExportTraceServiceRequest(spans, options);
  omitZeroSpanEndTimes(request, getUnendedSpanIds(spans));
  return request;
}

export function serializeTraceServiceRequestJson(
  spans: ReadableSpan[],
): Uint8Array {
  const request = createTraceServiceRequest(spans, {
    useHex: true,
    useLongBits: false,
  });
  return new TextEncoder().encode(JSON.stringify(request));
}

function getUnendedSpanIds(spans: ReadableSpan[]): Set<string> {
  const unendedSpanIds = new Set<string>();
  for (const span of spans) {
    if (!span.ended) {
      unendedSpanIds.add(spanKeyFromReadableSpan(span));
    }
  }
  return unendedSpanIds;
}

function omitZeroSpanEndTimes(
  request: IExportTraceServiceRequest,
  unendedSpanIds: Set<string>,
): void {
  if (unendedSpanIds.size === 0) {
    return;
  }

  for (const resourceSpans of request.resourceSpans ?? []) {
    for (const scopeSpans of resourceSpans.scopeSpans) {
      for (const span of scopeSpans.spans ?? []) {
        const spanId = spanKeyFromOtlpSpan(span);
        if (
          spanId &&
          unendedSpanIds.has(spanId) &&
          isZeroFixed64(span.endTimeUnixNano)
        ) {
          delete (span as { endTimeUnixNano?: unknown }).endTimeUnixNano;
        }
      }
    }
  }
}

function spanKeyFromReadableSpan(span: ReadableSpan): string {
  const { traceId, spanId } = span.spanContext();
  return `${traceId}:${spanId}`;
}

function spanKeyFromOtlpSpan(span: ISpan): string | undefined {
  if (!span.traceId || !span.spanId) {
    return undefined;
  }
  return `${encodedSpanIdToHex(span.traceId)}:${encodedSpanIdToHex(
    span.spanId,
  )}`;
}

function encodedSpanIdToHex(value: string | Uint8Array): string {
  if (typeof value === "string") {
    return value;
  }
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function isZeroFixed64(value: Fixed64): boolean {
  if (typeof value === "number") {
    return value === 0;
  }
  if (typeof value === "string") {
    return value === "0";
  }
  return value.low === 0 && value.high === 0;
}
