import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOT_CONTEXT, TraceFlags } from "@opentelemetry/api";
import type {
  ReadableSpan,
  Span,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { VercelRequestContext } from "../vercel-request-context/api";
import { CompositeSpanProcessor } from "./composite-span-processor";

const symbol = Symbol.for("@vercel/request-context");

function createRootSpan(traceId: string): Span {
  const spanContext = {
    traceId,
    spanId: "0000000000000001",
    traceFlags: TraceFlags.SAMPLED,
  };
  return {
    spanContext: () => spanContext,
    parentSpanContext: undefined,
    setAttributes: vi.fn(),
    attributes: {},
    instrumentationScope: { name: "test" },
    kind: 0,
    ended: true,
  } as unknown as Span;
}

describe("CompositeSpanProcessor", () => {
  let waitUntilTasks: (() => Promise<unknown>)[];

  beforeEach(() => {
    vi.useFakeTimers();
    waitUntilTasks = [];
    const context: VercelRequestContext = {
      waitUntil: (task) => {
        waitUntilTasks.push(
          typeof task === "function"
            ? task
            : async (): Promise<unknown> => task,
        );
      },
      headers: {},
      url: "/",
    };
    Object.defineProperty(globalThis, symbol, {
      configurable: true,
      value: { get: (): VercelRequestContext => context },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(globalThis, symbol);
  });

  it("stops waiting for a flush that never settles", async () => {
    const hangingProcessor: SpanProcessor = {
      onStart: vi.fn(),
      onEnd: vi.fn(),
      forceFlush: () =>
        new Promise<void>(() => {
          // Never settles.
        }),
      shutdown: () => Promise.resolve(),
    };
    const processor = new CompositeSpanProcessor([hangingProcessor], undefined);
    const span = createRootSpan("00000000000000000000000000000001");

    processor.onStart(span, ROOT_CONTEXT);
    processor.onEnd(span as unknown as ReadableSpan);
    expect(waitUntilTasks).toHaveLength(1);

    let settled = false;
    void waitUntilTasks[0]?.().then((): void => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });

  it("does not delay a flush that completes", async () => {
    const forceFlush = vi.fn((): Promise<void> => Promise.resolve());
    const processor = new CompositeSpanProcessor(
      [
        {
          onStart: vi.fn(),
          onEnd: vi.fn(),
          forceFlush,
          shutdown: (): Promise<void> => Promise.resolve(),
        },
      ],
      undefined,
    );
    const span = createRootSpan("00000000000000000000000000000002");

    processor.onStart(span, ROOT_CONTEXT);
    processor.onEnd(span as unknown as ReadableSpan);

    await waitUntilTasks[0]?.();

    expect(forceFlush).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
