import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ReadableSpan,
  Span,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { hrTime } from "@opentelemetry/core";
import { ROOT_CONTEXT, TraceFlags, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import type { VercelRequestContext } from "../vercel-request-context/api";
import { hasVercelRequestContextForTrace } from "../vercel-request-context/api";
import { CompositeSpanProcessor } from "./composite-span-processor";

const TRACE_ID = "ee75cd9e534ff5e9ed78b4a0c706f0f2";
const VRC_SYMBOL = Symbol.for("@vercel/request-context");
type GlobalWithReader = Record<symbol, unknown>;

function installAmbient(ctx: VercelRequestContext | undefined): void {
  (globalThis as GlobalWithReader)[VRC_SYMBOL] = { get: () => ctx };
}

function fakeVrc(): VercelRequestContext & {
  flushes: Array<() => Promise<unknown>>;
} {
  const flushes: Array<() => Promise<unknown>> = [];
  return {
    flushes,
    waitUntil: (promiseOrFunc) => {
      if (typeof promiseOrFunc === "function") {
        flushes.push(promiseOrFunc as () => Promise<unknown>);
      }
    },
    headers: {},
    url: "https://example.com",
    telemetry: { reportSpans: () => undefined },
  };
}

function readableSpanFields(spanId: string, parent: boolean) {
  const spanContext = {
    traceId: TRACE_ID,
    spanId,
    traceFlags: TraceFlags.SAMPLED,
    isRemote: false,
  };
  return {
    name: `span-${spanId}`,
    kind: SpanKind.INTERNAL,
    spanContext: () => spanContext,
    parentSpanContext: parent
      ? {
          spanId: "7e2a325411bdc191",
          traceId: TRACE_ID,
          traceFlags: TraceFlags.SAMPLED,
        }
      : undefined,
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

function createRootSpan(spanId: string): Span {
  return {
    ...readableSpanFields(spanId, false),
    setAttribute: () => undefined,
    setAttributes: () => undefined,
    addEvent: () => undefined,
    addLink: () => undefined,
    addLinks: () => undefined,
    setStatus: () => undefined,
    updateName: () => undefined,
    end: () => undefined,
    isRecording: () => true,
    recordException: () => undefined,
  } as unknown as Span;
}

function createChildEnd(spanId: string): ReadableSpan {
  return readableSpanFields(spanId, true) as unknown as ReadableSpan;
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

describe("CompositeSpanProcessor", () => {
  afterEach(() => {
    installAmbient(undefined);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("registers the request context for the trace at root start and finalizes it after the final flush", async () => {
    const vrc = fakeVrc();
    installAmbient(vrc);
    const { processor: downstream, forceFlush } = fakeProcessor();
    const processor = new CompositeSpanProcessor([downstream], undefined);

    const root = createRootSpan("7e2a325411bdc191");
    processor.onStart(root, ROOT_CONTEXT);

    // The trace's owning context is now captured, independent of the ambient one.
    installAmbient(undefined);
    expect(hasVercelRequestContextForTrace(TRACE_ID)).toBe(true);

    // Root ends; the waitUntil-registered final flush drains the processors
    // and finalizes (ships + unregisters) the trace.
    processor.onEnd(root as unknown as ReadableSpan);
    expect(vrc.flushes).toHaveLength(1);
    await vrc.flushes[0]?.();
    expect(forceFlush).toHaveBeenCalled();
    expect(hasVercelRequestContextForTrace(TRACE_ID)).toBe(false);
  });

  it("flushes in-context once the batch-size threshold of ended spans is reached", () => {
    installAmbient(fakeVrc());
    vi.stubEnv("OTEL_BSP_MAX_EXPORT_BATCH_SIZE", "3");
    const { processor: downstream, forceFlush } = fakeProcessor();
    const processor = new CompositeSpanProcessor([downstream], undefined);

    processor.onEnd(createChildEnd("0000000000000001"));
    processor.onEnd(createChildEnd("0000000000000002"));
    expect(forceFlush).toHaveBeenCalledTimes(0);

    processor.onEnd(createChildEnd("0000000000000003"));
    expect(forceFlush).toHaveBeenCalledTimes(1);
  });

  it("flushes in-context once the schedule delay elapses between ended spans", () => {
    installAmbient(fakeVrc());
    vi.stubEnv("OTEL_BSP_MAX_EXPORT_BATCH_SIZE", "1000000");
    vi.stubEnv("OTEL_BSP_SCHEDULE_DELAY", "5000");
    const { processor: downstream, forceFlush } = fakeProcessor();
    const processor = new CompositeSpanProcessor([downstream], undefined);

    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1000);
    processor.onEnd(createChildEnd("0000000000000001"));
    processor.onEnd(createChildEnd("0000000000000002"));
    expect(forceFlush).toHaveBeenCalledTimes(0);

    now.mockReturnValue(7000);
    processor.onEnd(createChildEnd("0000000000000003"));
    expect(forceFlush).toHaveBeenCalledTimes(1);
  });

  it("does not flush off-Vercel (no request context)", () => {
    installAmbient(undefined);
    vi.stubEnv("OTEL_BSP_MAX_EXPORT_BATCH_SIZE", "2");
    const { processor: downstream, forceFlush } = fakeProcessor();
    const processor = new CompositeSpanProcessor([downstream], undefined);

    for (let i = 1; i <= 5; i++) {
      processor.onEnd(createChildEnd(`00000000000000${i}0`));
    }
    expect(forceFlush).toHaveBeenCalledTimes(0);
  });
});
