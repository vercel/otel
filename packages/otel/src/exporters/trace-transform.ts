import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import type { IExportTraceServiceRequest } from "@opentelemetry/otlp-transformer/build/src/trace/internal-types";

function hrTimeToNanoseconds(hrTime: [number, number]): number {
  return hrTime[0] * 1_000_000_000 + hrTime[1];
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}
interface ExtendedReadableSpan extends ReadableSpan {
  parentSpanId?: string;
}

export function createExportTraceServiceRequest(
  spans: ReadableSpan[]
): IExportTraceServiceRequest {
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
              name: "test-scope",
              version: "1.0.0",
            },
            spans: spans.map((span) => {
              const extendedSpan = span as ExtendedReadableSpan;
              return {
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
                ...(extendedSpan.parentSpanId && {
                  parentSpanId: hexToBytes(extendedSpan.parentSpanId),
                }),
              };
            }),
          },
        ],
      },
    ],
  } as IExportTraceServiceRequest;
}
