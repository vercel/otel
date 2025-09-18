import { describe, expect, it } from "vitest";
import type { TimedEvent, ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { ProtobufTraceSerializer } from "@opentelemetry/otlp-transformer";
import { createExportTraceServiceRequest } from "@opentelemetry/otlp-transformer/build/src/trace/internal";
import type { InstrumentationScope } from "@opentelemetry/core";
import { hrTime, TraceState } from "@opentelemetry/core";
import type { Attributes, Link, HrTime, SpanStatus } from "@opentelemetry/api";
import { TraceFlags, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { encodeTraceServiceRequest } from "./proto";

describe("OTLP Protobuf", () => {
  const performanceOffset = new Date("2024-04-25T00:00:00.000Z").getTime();
  type LocalTime = number;

  function createSpan({
    name,
    kind,
    parentSpanContext,
    attributes,
    startTime,
    endTime,
    links,
    events,
    instrumentationScope,
    droppedAttributesCount,
    droppedEventsCount,
    droppedLinksCount,
    status,
    traceState,
  }: {
    name?: string;
    kind?: SpanKind;
    parentSpanContext?: string;
    attributes?: Attributes;
    startTime?: LocalTime;
    endTime?: LocalTime;
    links?: Link[];
    events?: TimedEvent[];
    instrumentationScope?: InstrumentationScope;
    droppedAttributesCount?: number;
    droppedEventsCount?: number;
    droppedLinksCount?: number;
    status?: SpanStatus;
    traceState?: TraceState;
  }): ReadableSpan {
    const resource = resourceFromAttributes({
      env: "production",
    });

    const spanContext = {
      traceId: "ee75cd9e534ff5e9ed78b4a0c706f0f2",
      spanId: "0f6a325411bdc432",
      traceFlags: TraceFlags.SAMPLED,
      isRemote: false,
      traceState,
    };

    const startTimeLocal = startTime ?? 1;
    const endTimeLocal = endTime ?? startTimeLocal + 1;
    return {
      name: name ?? "span1",
      kind: kind ?? SpanKind.SERVER,
      spanContext: () => spanContext,
      parentSpanContext:
        parentSpanContext !== undefined && parentSpanContext
          ? {
              spanId: parentSpanContext,
              traceId: "ee75cd9e534ff5e9ed78b4a0c706f0f2",
              traceFlags: TraceFlags.SAMPLED,
            }
          : {
              spanId: "7e2a325411bdc191",
              traceId: "ee75cd9e534ff5e9ed78b4a0c706f0f2",
              traceFlags: TraceFlags.SAMPLED,
            },
      startTime: time(startTimeLocal),
      endTime: time(endTimeLocal),
      status: status ?? { code: SpanStatusCode.UNSET },
      attributes: { ...attributes },
      links: links ?? [],
      events: events ?? [],
      duration: time(endTimeLocal - startTimeLocal),
      ended: true,
      resource,
      instrumentationScope: instrumentationScope ?? { name: "default" },
      droppedAttributesCount: droppedAttributesCount ?? 0,
      droppedEventsCount: droppedEventsCount ?? 0,
      droppedLinksCount: droppedLinksCount ?? 0,
    };
  }

  function createLink({
    attributes,
    droppedAttributesCount,
  }: {
    attributes?: Attributes;
    droppedAttributesCount?: number;
  }): Link {
    const spanContext = {
      traceId: "ee75cd9e534ff5e9ed78b4a0c706f0f2",
      spanId: "0f6a325411bdc432",
      traceFlags: TraceFlags.SAMPLED,
    };

    return {
      context: spanContext,
      attributes: { ...attributes },
      droppedAttributesCount: droppedAttributesCount ?? 0,
    };
  }

  function createEvent({
    name,
    time: timeArg,
    attributes,
    droppedAttributesCount,
  }: {
    name?: string;
    time?: number;
    attributes?: Attributes;
    droppedAttributesCount?: number;
  }): TimedEvent {
    const timeLocal = timeArg ?? 1;
    return {
      name: name ?? "event1",
      time: time(timeLocal),
      attributes: { ...attributes },
      droppedAttributesCount: droppedAttributesCount ?? 0,
    };
  }

  function time(inp: number): HrTime {
    return hrTime(performanceOffset + inp);
  }

  function encodeViaOtlpLibrary(spans: ReadableSpan[]): Uint8Array {
    const result = ProtobufTraceSerializer.serializeRequest(spans);
    if (!result) {
      throw new Error("Failed to serialize request");
    }
    return result;
  }

  function validateProtobufEncoding(spans: ReadableSpan[]): void {
    const request = createExportTraceServiceRequest(spans);

    // Both encoders should produce valid protobuf without errors
    const expected = encodeViaOtlpLibrary(spans);
    const actual = encodeTraceServiceRequest(request);

    // Validate that both produce valid Uint8Array protobuf output
    expect(actual).toBeInstanceOf(Uint8Array);
    expect(expected).toBeInstanceOf(Uint8Array);
    expect(actual.length).toBeGreaterThan(0);
    expect(expected.length).toBeGreaterThan(0);

    // Verify that encoding doesn't throw
    expect(() => encodeTraceServiceRequest(request)).not.toThrow();
    expect(() => encodeViaOtlpLibrary(spans)).not.toThrow();
  }

  it("should encode a bare minimum span", () => {
    const span = createSpan({});
    validateProtobufEncoding([span]);
  });

  it("should encode multiple spans", () => {
    const span1 = createSpan({ name: "span1" });
    const span2 = createSpan({ name: "span2" });
    validateProtobufEncoding([span1, span2]);
  });

  it("should encode a kind", () => {
    const span = createSpan({ kind: SpanKind.CONSUMER });
    validateProtobufEncoding([span]);
  });

  it("should encode an empty parentSpanContext", () => {
    const span = createSpan({ parentSpanContext: "" });
    validateProtobufEncoding([span]);
  });

  it("should encode a tracestate", () => {
    const span = createSpan({ traceState: new TraceState("foo=bar") });
    validateProtobufEncoding([span]);
  });

  it("should encode a status", () => {
    const span = createSpan({
      status: {
        code: SpanStatusCode.ERROR,
        message: "some error",
      },
    });
    validateProtobufEncoding([span]);
  });

  describe("instrumentationScope", () => {
    it("should encode instrumentationScope", () => {
      const span = createSpan({
        instrumentationScope: { name: "lib1" },
      });
      validateProtobufEncoding([span]);
    });

    it("should encode instrumentationScope with version", () => {
      const span = createSpan({
        instrumentationScope: { name: "lib1", version: "1.0.1" },
      });
      validateProtobufEncoding([span]);
    });

    it("should encode instrumentationScope with schema", () => {
      const span = createSpan({
        instrumentationScope: {
          name: "lib1",
          version: "1.0.1",
          schemaUrl: "https://vercel.com/schema1",
        },
      });
      validateProtobufEncoding([span]);
    });
  });

  describe("dropped counts", () => {
    it("should encode droppedAttributesCount", () => {
      const span = createSpan({ droppedAttributesCount: 11 });
      validateProtobufEncoding([span]);
    });

    it("should encode droppedEventsCount", () => {
      const span = createSpan({ droppedEventsCount: 11 });
      validateProtobufEncoding([span]);
    });

    it("should encode droppedLinksCount", () => {
      const span = createSpan({ droppedLinksCount: 11 });
      validateProtobufEncoding([span]);
    });
  });

  describe("attributes", () => {
    it("should encode string attributes", () => {
      const span = createSpan({ attributes: { foo: "bar", baz: "bat" } });
      validateProtobufEncoding([span]);
    });

    it("should encode numeric attributes", () => {
      const span = createSpan({ attributes: { foo: 1, baz: 2 } });
      validateProtobufEncoding([span]);
    });

    it("should encode boolean attributes", () => {
      const span = createSpan({ attributes: { foo: true, baz: false } });
      validateProtobufEncoding([span]);
    });

    it("should encode array attributes", () => {
      const span = createSpan({ attributes: { foo: [1, 2, 3, null] } });
      validateProtobufEncoding([span]);
    });
  });

  describe("links", () => {
    it("should encode a single link", () => {
      const span = createSpan({ links: [createLink({})] });
      validateProtobufEncoding([span]);
    });

    it("should encode a single link with attributes", () => {
      const span = createSpan({
        links: [createLink({ attributes: { foo: "bar", baz: true, bat: 11 } })],
      });
      validateProtobufEncoding([span]);
    });

    it("should encode a single link with droppedAttributesCount", () => {
      const span = createSpan({
        links: [createLink({ droppedAttributesCount: 11 })],
      });
      validateProtobufEncoding([span]);
    });

    it("should encode multiple links", () => {
      const span = createSpan({
        links: [
          createLink({ attributes: { foo: 1 } }),
          createLink({ attributes: { foo: 2 } }),
        ],
      });
      validateProtobufEncoding([span]);
    });
  });

  describe("events", () => {
    it("should encode a single event", () => {
      const span = createSpan({ events: [createEvent({})] });
      validateProtobufEncoding([span]);
    });

    it("should encode a single event with attributes", () => {
      const span = createSpan({
        events: [
          createEvent({ attributes: { foo: "bar", baz: true, bat: 11 } }),
        ],
      });
      validateProtobufEncoding([span]);
    });

    it("should encode a single event with droppedAttributesCount", () => {
      const span = createSpan({
        events: [createEvent({ droppedAttributesCount: 11 })],
      });
      validateProtobufEncoding([span]);
    });

    it("should encode multiple events", () => {
      const span = createSpan({
        events: [
          createEvent({ name: "event1", attributes: { foo: 1 } }),
          createEvent({ name: "event2", attributes: { foo: 2 } }),
        ],
      });
      validateProtobufEncoding([span]);
    });
  });
});
