import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { diag, ROOT_CONTEXT, TraceFlags } from "@opentelemetry/api";
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
    vi.restoreAllMocks();
  });

  function hangingProcessor(): SpanProcessor {
    return {
      onStart: vi.fn(),
      onEnd: vi.fn(),
      forceFlush: () =>
        new Promise<void>(() => {
          // Never settles.
        }),
      shutdown: () => Promise.resolve(),
    };
  }

  async function expectFlushSettlesAt(
    processor: CompositeSpanProcessor,
    traceId: string,
    expectedMs: number,
  ): Promise<void> {
    const span = createRootSpan(traceId);
    processor.onStart(span, ROOT_CONTEXT);
    processor.onEnd(span as unknown as ReadableSpan);
    expect(waitUntilTasks).toHaveLength(1);

    const state = { settled: false };
    void waitUntilTasks[0]?.().then((): void => {
      state.settled = true;
    });
    await vi.advanceTimersByTimeAsync(expectedMs - 1);
    expect(state.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.settled).toBe(true);
  }

  it("stops waiting for a flush that never settles after 10s by default", async () => {
    const processor = new CompositeSpanProcessor(
      [hangingProcessor()],
      undefined,
    );

    await expectFlushSettlesAt(
      processor,
      "00000000000000000000000000000001",
      10_000,
    );
  });

  it("uses flushTimeoutMillis when set", async () => {
    const processor = new CompositeSpanProcessor(
      [hangingProcessor()],
      undefined,
      2_000,
    );

    await expectFlushSettlesAt(
      processor,
      "00000000000000000000000000000003",
      2_000,
    );
  });

  it.each([0, -1, NaN, Infinity])(
    "falls back to 10s and warns when flushTimeoutMillis is %s",
    async (flushTimeoutMillis) => {
      const warn = vi.spyOn(diag, "warn");
      const processor = new CompositeSpanProcessor(
        [hangingProcessor()],
        undefined,
        flushTimeoutMillis,
      );

      expect(warn).toHaveBeenCalledWith(
        `@vercel/otel: ignoring invalid flushTimeoutMillis: ${flushTimeoutMillis}`,
      );
      await expectFlushSettlesAt(
        processor,
        "00000000000000000000000000000004",
        10_000,
      );
    },
  );

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
