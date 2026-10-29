import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReadableSpan, SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { hrTime } from "@opentelemetry/core";
import { TraceFlags, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import type { VercelRequestContext } from "../vercel-request-context/api";
import { CompositeSpanProcessor } from "./composite-span-processor";

const VRC_SYMBOL = Symbol.for("@vercel/request-context");
type GlobalWithReader = Record<symbol, unknown>;

function installContext(ctx: VercelRequestContext | undefined): void {
  (globalThis as GlobalWithReader)[VRC_SYMBOL] = { get: () => ctx };
}

function fakeVrc(): VercelRequestContext {
  return {
    waitUntil: () => undefined,
    headers: {},
    url: "https://example.com",
    telemetry: { reportSpans: () => undefined },
  };
}

function createChildSpan(spanId: string): ReadableSpan {
  const spanContext = {
    traceId: "ee75cd9e534ff5e9ed78b4a0c706f0f2",
    spanId,
    traceFlags: TraceFlags.SAMPLED,
    isRemote: false,
  };
  return {
    name: `span-${spanId}`,
    kind: SpanKind.INTERNAL,
    spanContext: () => spanContext,
    parentSpanContext: {
      spanId: "7e2a325411bdc191",
      traceId: "ee75cd9e534ff5e9ed78b4a0c706f0f2",
      traceFlags: TraceFlags.SAMPLED,
    },
    startTime: hrTime(1),
    endTime: hrTime(2),
    status: { code: SpanStatusCode.UNSET },
    attributes: {},
    links: [],
    events: [],
    duration: hrTime(1),
    ended: true,
    resource: resourceFromAttributes({}),
    instrumentationScope: { name: "default" },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  };
}

function fakeProcessor(): {
  processor: SpanProcessor;
  forceFlush: ReturnType<typeof vi.fn>;
} {
  const forceFlush = vi.fn().mockResolvedValue(undefined);
  const processor: SpanProcessor = {
    onStart: vi.fn(),
    onEnd: vi.fn(),
    forceFlush,
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
  return { processor, forceFlush };
}

describe("CompositeSpanProcessor in-context flush", () => {
  afterEach(() => {
    installContext(undefined);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("flushes once the batch-size threshold of ended spans is reached", () => {
    installContext(fakeVrc());
    vi.stubEnv("OTEL_BSP_MAX_EXPORT_BATCH_SIZE", "3");
    const { processor: downstream, forceFlush } = fakeProcessor();
    const processor = new CompositeSpanProcessor([downstream], undefined);

    processor.onEnd(createChildSpan("0000000000000001"));
    processor.onEnd(createChildSpan("0000000000000002"));
    expect(forceFlush).toHaveBeenCalledTimes(0);

    processor.onEnd(createChildSpan("0000000000000003"));
    expect(forceFlush).toHaveBeenCalledTimes(1);
  });

  it("does not flush off-Vercel (no request context)", () => {
    installContext(undefined);
    vi.stubEnv("OTEL_BSP_MAX_EXPORT_BATCH_SIZE", "3");
    const { processor: downstream, forceFlush } = fakeProcessor();
    const processor = new CompositeSpanProcessor([downstream], undefined);

    for (let i = 1; i <= 5; i++) {
      processor.onEnd(createChildSpan(`00000000000000${i}0`));
    }
    expect(forceFlush).toHaveBeenCalledTimes(0);
  });

  it("flushes once the schedule-delay elapses between ended spans", () => {
    installContext(fakeVrc());
    vi.stubEnv("OTEL_BSP_MAX_EXPORT_BATCH_SIZE", "1000000");
    vi.stubEnv("OTEL_BSP_SCHEDULE_DELAY", "5000");
    const { processor: downstream, forceFlush } = fakeProcessor();
    const processor = new CompositeSpanProcessor([downstream], undefined);

    const now = vi.spyOn(Date, "now");

    now.mockReturnValue(1000);
    processor.onEnd(createChildSpan("0000000000000001"));
    now.mockReturnValue(1000);
    processor.onEnd(createChildSpan("0000000000000002"));
    expect(forceFlush).toHaveBeenCalledTimes(0);

    now.mockReturnValue(7000);
    processor.onEnd(createChildSpan("0000000000000003"));
    expect(forceFlush).toHaveBeenCalledTimes(1);
  });
});
