import { afterEach, describe, expect, it, vi } from "vitest";
import type { Span, SpanProcessor } from "@opentelemetry/sdk-trace-base";
import type { VercelRequestContext } from "../vercel-request-context/api";
import { FilterWhenDrainedSpanProcessor } from "./filter-when-drained-span-processor";

const symbol = Symbol.for("@vercel/request-context");

function setRequestContext(context: VercelRequestContext): void {
  Object.defineProperty(globalThis, symbol, {
    configurable: true,
    value: { get: (): VercelRequestContext => context },
  });
}

describe("FilterWhenDrainedSpanProcessor", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, symbol);
  });

  function wrap(): {
    onEnding: ReturnType<typeof vi.fn>;
    processor: SpanProcessor;
  } {
    const onEnding = vi.fn();
    const inner: SpanProcessor = {
      onStart: vi.fn(),
      onEnding,
      onEnd: vi.fn(),
      forceFlush: () => Promise.resolve(),
      shutdown: () => Promise.resolve(),
    };
    return { onEnding, processor: new FilterWhenDrainedSpanProcessor(inner) };
  }

  it("forwards onEnding when traces are not drained", () => {
    const { onEnding, processor } = wrap();
    const span = {} as Span;
    processor.onEnding?.(span);
    expect(onEnding).toHaveBeenCalledWith(span);
  });

  it("skips onEnding when traces are drained", () => {
    setRequestContext({
      waitUntil: vi.fn(),
      headers: {},
      url: "/",
      telemetry: { reportSpans: vi.fn(), traceDrains: ["drain"] },
    });
    const { onEnding, processor } = wrap();
    processor.onEnding?.({} as Span);
    expect(onEnding).not.toHaveBeenCalled();
  });
});
