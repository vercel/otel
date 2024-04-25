import { describe, expect, it } from "vitest";
import type { TimedEvent, ReadableSpan } from "@opentelemetry/sdk-trace-base";
import type { IExportTraceServiceRequest } from "@opentelemetry/otlp-transformer";
import { createExportTraceServiceRequest } from "@opentelemetry/otlp-transformer/build/src/trace";
import { ServiceClientType } from "@opentelemetry/otlp-proto-exporter-base/build/src/platform/index";
import { getExportRequestProto } from "@opentelemetry/otlp-proto-exporter-base/build/src/platform/util";
import { hrTime, TraceState } from "@opentelemetry/core";
import type { InstrumentationLibrary } from "@opentelemetry/core";
import type { Attributes, Link, HrTime, SpanStatus } from "@opentelemetry/api";
import { TraceFlags, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { Resource } from "@opentelemetry/resources";
import { encodeTraceServiceRequest } from "./proto";

describe("OTLP Protobuf", () => {
  const performanceOffset = new Date("2024-04-25T00:00:00.000Z").getTime();
  type LocalTime = number;

  function createSpan({
    name,
    kind,
    parentSpanId,
    attributes,
    startTime,
    endTime,
    links,
    events,
    instrumentationLibrary,
    droppedAttributesCount,
    droppedEventsCount,
    droppedLinksCount,
    status,
    traceState,
  }: {
    name?: string;
    kind?: SpanKind;
    parentSpanId?: string;
    attributes?: Attributes;
    startTime?: LocalTime;
    endTime?: LocalTime;
    links?: Link[];
    events?: TimedEvent[];
    instrumentationLibrary?: InstrumentationLibrary;
    droppedAttributesCount?: number;
    droppedEventsCount?: number;
    droppedLinksCount?: number;
    status?: SpanStatus;
    traceState?: TraceState;
  }): ReadableSpan {
    const resource = new Resource({
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
      parentSpanId:
        parentSpanId !== undefined
          ? parentSpanId || undefined
          : "7e2a325411bdc191",
      startTime: time(startTimeLocal),
      endTime: time(endTimeLocal),
      status: status ?? { code: SpanStatusCode.UNSET },
      attributes: { ...attributes },
      links: links ?? [],
      events: events ?? [],
      duration: time(endTimeLocal - startTimeLocal),
      ended: true,
      resource,
      instrumentationLibrary: instrumentationLibrary ?? { name: "default" },
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

  function encodeViaOtlpLibrary(
    request: IExportTraceServiceRequest
  ): Uint8Array {
    const serviceClientType = ServiceClientType.SPANS;
    const exportRequestType = getExportRequestProto(serviceClientType);
    const message = exportRequestType.create(request);
    return new Uint8Array(exportRequestType.encode(message).finish());
  }

  it("should match a bare minimum span", () => {
    const span = createSpan({});
    const request = createExportTraceServiceRequest([span], undefined);
    const expected = encodeViaOtlpLibrary(request);
    const actual = encodeTraceServiceRequest(request);
    expect(actual.toString()).toEqual(expected.toString());
  });

  it("should match multiple spans", () => {
    const span1 = createSpan({ name: "span1" });
    const span2 = createSpan({ name: "span2" });
    const request = createExportTraceServiceRequest([span1, span2], undefined);
    const expected = encodeViaOtlpLibrary(request);
    const actual = encodeTraceServiceRequest(request);
    expect(actual.toString()).toEqual(expected.toString());
  });

  it("should match a kind", () => {
    const span = createSpan({ kind: SpanKind.CONSUMER });
    const request = createExportTraceServiceRequest([span], undefined);
    const expected = encodeViaOtlpLibrary(request);
    const actual = encodeTraceServiceRequest(request);
    expect(actual.toString()).toEqual(expected.toString());
  });

  it("should match an empty parentSpanId", () => {
    const span = createSpan({ parentSpanId: "" });
    const request = createExportTraceServiceRequest([span], undefined);
    const expected = encodeViaOtlpLibrary(request);
    const actual = encodeTraceServiceRequest(request);
    expect(actual.toString()).toEqual(expected.toString());
  });

  it("should match a tracestate", () => {
    const span = createSpan({ traceState: new TraceState("foo=bar") });
    const request = createExportTraceServiceRequest([span], undefined);
    const expected = encodeViaOtlpLibrary(request);
    const actual = encodeTraceServiceRequest(request);
    expect(actual.toString()).toEqual(expected.toString());
  });

  it("should match a status", () => {
    const span = createSpan({
      status: {
        code: SpanStatusCode.ERROR,
        message: "some error",
      },
    });
    const request = createExportTraceServiceRequest([span], undefined);
    const expected = encodeViaOtlpLibrary(request);
    const actual = encodeTraceServiceRequest(request);
    expect(actual.toString()).toEqual(expected.toString());
  });

  describe("instrumentationLibrary", () => {
    it("should match instrumentationLibrary", () => {
      const span = createSpan({
        instrumentationLibrary: { name: "lib1" },
      });
      const request = createExportTraceServiceRequest([span], undefined);
      const expected = encodeViaOtlpLibrary(request);
      const actual = encodeTraceServiceRequest(request);
      expect(actual.toString()).toEqual(expected.toString());
    });

    it("should match instrumentationLibrary with version", () => {
      const span = createSpan({
        instrumentationLibrary: { name: "lib1", version: "1.0.1" },
      });
      const request = createExportTraceServiceRequest([span], undefined);
      const expected = encodeViaOtlpLibrary(request);
      const actual = encodeTraceServiceRequest(request);
      expect(actual.toString()).toEqual(expected.toString());
    });

    it("should match instrumentationLibrary with schema", () => {
      const span = createSpan({
        instrumentationLibrary: {
          name: "lib1",
          version: "1.0.1",
          schemaUrl: "https://vercel.com/schema1",
        },
      });
      const request = createExportTraceServiceRequest([span], undefined);
      const expected = encodeViaOtlpLibrary(request);
      const actual = encodeTraceServiceRequest(request);
      expect(actual.toString()).toEqual(expected.toString());
    });
  });

  describe("dropped counts", () => {
    it("should match droppedAttributesCount", () => {
      const span = createSpan({ droppedAttributesCount: 11 });
      const request = createExportTraceServiceRequest([span], undefined);
      const expected = encodeViaOtlpLibrary(request);
      const actual = encodeTraceServiceRequest(request);
      expect(actual.toString()).toEqual(expected.toString());
    });

    it("should match droppedEventsCount", () => {
      const span = createSpan({ droppedEventsCount: 11 });
      const request = createExportTraceServiceRequest([span], undefined);
      const expected = encodeViaOtlpLibrary(request);
      const actual = encodeTraceServiceRequest(request);
      expect(actual.toString()).toEqual(expected.toString());
    });

    it("should match droppedLinksCount", () => {
      const span = createSpan({ droppedLinksCount: 11 });
      const request = createExportTraceServiceRequest([span], undefined);
      const expected = encodeViaOtlpLibrary(request);
      const actual = encodeTraceServiceRequest(request);
      expect(actual.toString()).toEqual(expected.toString());
    });
  });

  describe("attributes", () => {
    it("should match string attributes", () => {
      const span = createSpan({ attributes: { foo: "bar", baz: "bat" } });
      const request = createExportTraceServiceRequest([span], undefined);
      const expected = encodeViaOtlpLibrary(request);
      const actual = encodeTraceServiceRequest(request);
      expect(actual.toString()).toEqual(expected.toString());
    });

    it("should match numeric attributes", () => {
      const span = createSpan({ attributes: { foo: 1, baz: 2 } });
      const request = createExportTraceServiceRequest([span], undefined);
      const expected = encodeViaOtlpLibrary(request);
      const actual = encodeTraceServiceRequest(request);
      expect(actual.toString()).toEqual(expected.toString());
    });

    it("should match boolean attributes", () => {
      const span = createSpan({ attributes: { foo: true, baz: false } });
      const request = createExportTraceServiceRequest([span], undefined);
      const expected = encodeViaOtlpLibrary(request);
      const actual = encodeTraceServiceRequest(request);
      expect(actual.toString()).toEqual(expected.toString());
    });

    it("should match array attributes", () => {
      const span = createSpan({ attributes: { foo: [1, 2, 3, null] } });
      const request = createExportTraceServiceRequest([span], undefined);
      const expected = encodeViaOtlpLibrary(request);
      const actual = encodeTraceServiceRequest(request);
      expect(actual.toString()).toEqual(expected.toString());
    });
  });

  describe("links", () => {
    it("should match a single link", () => {
      const span = createSpan({ links: [createLink({})] });
      const request = createExportTraceServiceRequest([span], undefined);
      const expected = encodeViaOtlpLibrary(request);
      const actual = encodeTraceServiceRequest(request);
      expect(actual.toString()).toEqual(expected.toString());
    });

    it("should match a single link with attributes", () => {
      const span = createSpan({
        links: [createLink({ attributes: { foo: "bar", baz: true, bat: 11 } })],
      });
      const request = createExportTraceServiceRequest([span], undefined);
      const expected = encodeViaOtlpLibrary(request);
      const actual = encodeTraceServiceRequest(request);
      expect(actual.toString()).toEqual(expected.toString());
    });

    it("should match a single link with droppedAttributesCount", () => {
      const span = createSpan({
        links: [createLink({ droppedAttributesCount: 11 })],
      });
      const request = createExportTraceServiceRequest([span], undefined);
      const expected = encodeViaOtlpLibrary(request);
      const actual = encodeTraceServiceRequest(request);
      expect(actual.toString()).toEqual(expected.toString());
    });

    it("should match multiple links", () => {
      const span = createSpan({
        links: [
          createLink({ attributes: { foo: 1 } }),
          createLink({ attributes: { foo: 2 } }),
        ],
      });
      const request = createExportTraceServiceRequest([span], undefined);
      const expected = encodeViaOtlpLibrary(request);
      const actual = encodeTraceServiceRequest(request);
      expect(actual.toString()).toEqual(expected.toString());
    });
  });

  describe("events", () => {
    it("should match a single event", () => {
      const span = createSpan({ events: [createEvent({})] });
      const request = createExportTraceServiceRequest([span], undefined);
      const expected = encodeViaOtlpLibrary(request);
      const actual = encodeTraceServiceRequest(request);
      expect(actual.toString()).toEqual(expected.toString());
    });

    it("should match a single event with attributes", () => {
      const span = createSpan({
        events: [
          createEvent({ attributes: { foo: "bar", baz: true, bat: 11 } }),
        ],
      });
      const request = createExportTraceServiceRequest([span], undefined);
      const expected = encodeViaOtlpLibrary(request);
      const actual = encodeTraceServiceRequest(request);
      expect(actual.toString()).toEqual(expected.toString());
    });

    it("should match a single event with droppedAttributesCount", () => {
      const span = createSpan({
        events: [createEvent({ droppedAttributesCount: 11 })],
      });
      const request = createExportTraceServiceRequest([span], undefined);
      const expected = encodeViaOtlpLibrary(request);
      const actual = encodeTraceServiceRequest(request);
      expect(actual.toString()).toEqual(expected.toString());
    });

    it("should match multiple events", () => {
      const span = createSpan({
        events: [
          createEvent({ name: "event1", attributes: { foo: 1 } }),
          createEvent({ name: "event2", attributes: { foo: 2 } }),
        ],
      });
      const request = createExportTraceServiceRequest([span], undefined);
      const expected = encodeViaOtlpLibrary(request);
      const actual = encodeTraceServiceRequest(request);
      expect(actual.toString()).toEqual(expected.toString());
    });
  });
});
