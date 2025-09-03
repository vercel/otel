import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import type {
  IExportTraceServiceRequest,
  ISpan,
} from "@opentelemetry/otlp-transformer/build/src/trace/internal-types";
import { hrTimeToNanoseconds } from "@opentelemetry/core";

export function createExportTraceServiceRequest(
  spans: ReadableSpan[]
): IExportTraceServiceRequest {
  if (spans.length === 0) {
    return { resourceSpans: [] };
  }

  const firstSpan = spans[0]!;

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [],
          droppedAttributesCount: 0,
        },
        scopeSpans: [
          {
            scope: {
              name:
                (firstSpan as any).instrumentationLibrary?.name || "unknown",
              version: (firstSpan as any).instrumentationLibrary?.version || "",
            },
            spans: spans.map(transformSpan),
          },
        ],
      },
    ],
  };
}

function transformSpan(span: ReadableSpan): ISpan {
  const transformedSpan: ISpan = {
    traceId: hexToBytes(span.spanContext().traceId),
    spanId: hexToBytes(span.spanContext().spanId),
    name: span.name,
    kind: 0,
    startTimeUnixNano: hrTimeToNanoseconds(span.startTime),
    endTimeUnixNano: hrTimeToNanoseconds(span.endTime),
    attributes: [],
    droppedAttributesCount: 0,
    events: [],
    droppedEventsCount: 0,
    links: [],
    droppedLinksCount: 0,
    status: { code: 0 },
  };

  // Handle parent span - this is the 2.x compatibility fix!
  if ((span as any).parentSpanId) {
    // 1.x style
    transformedSpan.parentSpanId = hexToBytes((span as any).parentSpanId);
  } else if ((span as any).parentSpanContext?.spanId) {
    // 2.x style
    transformedSpan.parentSpanId = hexToBytes(
      (span as any).parentSpanContext.spanId
    );
  }

  return transformedSpan;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}
