import { context, TraceFlags, type SpanContext } from "@opentelemetry/api";
import type {
  ReadableSpan,
  Span,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequestContext } from "../vercel-request-context/api";
import { FilterWhenDrainedSpanProcessor } from "./filter-when-drained-span-processor";

const requestContextSymbol = Symbol.for("@vercel/request-context");

let activeContext: VercelRequestContext | undefined;

beforeEach(() => {
  activeContext = undefined;
  Reflect.set(globalThis, requestContextSymbol, {
    get: () => activeContext,
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, requestContextSymbol);
});

describe("FilterWhenDrainedSpanProcessor", () => {
  it("forwards spans when there are no trace drains", () => {
    const { onEnd, onStart, processor } = createProcessor();
    const filter = new FilterWhenDrainedSpanProcessor(processor);
    const span = createSpan();

    filter.onStart(span, context.active());
    filter.onEnd(span);

    expect(onStart).toHaveBeenCalledWith(span, context.active());
    expect(onEnd).toHaveBeenCalledWith(span);
  });

  it("skips spans when trace drains are configured", () => {
    activeContext = createDrainingContext();
    const { onEnd, onStart, processor } = createProcessor();
    const filter = new FilterWhenDrainedSpanProcessor(processor);
    const span = createSpan();

    filter.onStart(span, context.active());
    filter.onEnd(span);

    expect(onStart).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("skips drained spans when request context is lost before span end", () => {
    activeContext = createDrainingContext();
    const { onEnd, onStart, processor } = createProcessor();
    const filter = new FilterWhenDrainedSpanProcessor(processor);
    const span = createSpan();

    filter.onStart(span, context.active());
    activeContext = undefined;
    filter.onEnd(span);

    expect(onStart).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("does not skip unrelated spans after request context is lost", () => {
    activeContext = createDrainingContext();
    const { onEnd, onStart, processor } = createProcessor();
    const filter = new FilterWhenDrainedSpanProcessor(processor);
    const drainedSpan = createSpan("0".repeat(32), "0".repeat(16));
    const otherSpan = createSpan("1".repeat(32), "1".repeat(16));

    filter.onStart(drainedSpan, context.active());
    activeContext = undefined;
    filter.onEnd(otherSpan);

    expect(onStart).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledWith(otherSpan);
  });

  it("caps remembered drained spans", () => {
    activeContext = createDrainingContext();
    const { onEnd, processor } = createProcessor();
    const filter = new FilterWhenDrainedSpanProcessor(processor);
    const firstSpan = createSpan("0".repeat(32), "0".repeat(16));

    filter.onStart(firstSpan, context.active());
    for (let i = 1; i <= 10_000; i++) {
      filter.onStart(createSpan(createTraceId(i), createSpanId(i)), context.active());
    }

    activeContext = undefined;
    filter.onEnd(firstSpan);
    filter.onEnd(createSpan(createTraceId(10_000), createSpanId(10_000)));

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith(firstSpan);
  });
});

function createProcessor(): {
  onEnd: ReturnType<typeof vi.fn>;
  onStart: ReturnType<typeof vi.fn>;
  processor: SpanProcessor;
} {
  const onEnd = vi.fn();
  const onStart = vi.fn();
  return {
    onEnd,
    onStart,
    processor: {
      forceFlush: vi.fn(() => Promise.resolve()),
      onEnd,
      onStart,
      shutdown: vi.fn(() => Promise.resolve()),
    },
  };
}

function createDrainingContext(): VercelRequestContext {
  return {
    headers: {},
    telemetry: {
      reportSpans: vi.fn(),
      traceDrains: ["traceful.dev"],
    },
    url: "https://example.com",
    waitUntil: vi.fn(),
  };
}

function createSpan(
  traceId = "0".repeat(32),
  spanId = "0".repeat(16),
): Span & ReadableSpan {
  const spanContext = (): SpanContext => ({
    spanId,
    traceFlags: TraceFlags.SAMPLED,
    traceId,
  });
  return { spanContext } as unknown as Span & ReadableSpan;
}

function createTraceId(value: number): string {
  return value.toString(16).padStart(32, "0");
}

function createSpanId(value: number): string {
  return value.toString(16).padStart(16, "0");
}
