import { AsyncLocalStorage } from "node:async_hooks";
import type { Context, ContextManager, SpanContext } from "@opentelemetry/api";
import {
  context as contextApi,
  propagation,
  ROOT_CONTEXT,
  TraceFlags,
  trace,
} from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Sdk } from "../sdk";
import type { VercelRequestContext } from "./api";
import { VercelRuntimeContextManager } from "./context-manager";

const requestContextSymbol = Symbol.for("@vercel/request-context");
const platformRoot: SpanContext = {
  traceId: "11111111111111111111111111111111",
  spanId: "2222222222222222",
  traceFlags: TraceFlags.SAMPLED,
};

class DelegateContextManager implements ContextManager {
  public activeContext: Context = ROOT_CONTEXT;
  public enableCalls = 0;
  public disableCalls = 0;
  public withCall:
    | {
        context: Context;
        fn: unknown;
        thisArg: unknown;
        args: unknown[];
      }
    | undefined;
  public bindCall: { context: Context; target: unknown } | undefined;

  public active(): Context {
    return this.activeContext;
  }

  public with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    context: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    this.withCall = {
      context,
      fn,
      thisArg,
      args,
    };
    return fn.call(thisArg, ...args);
  }

  public bind<T>(context: Context, target: T): T {
    this.bindCall = { context, target };
    return target;
  }

  public enable(): this {
    this.enableCalls += 1;
    return this;
  }

  public disable(): this {
    this.disableCalls += 1;
    return this;
  }
}

describe("VercelRuntimeContextManager", () => {
  let delegate: DelegateContextManager;
  let manager: VercelRuntimeContextManager;
  let currentRequestContext: VercelRequestContext | undefined;

  beforeEach(() => {
    delegate = new DelegateContextManager();
    manager = new VercelRuntimeContextManager(delegate);
    currentRequestContext = createRequestContext(platformRoot);
    Object.defineProperty(globalThis, requestContextSymbol, {
      configurable: true,
      value: { get: () => currentRequestContext },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, requestContextSymbol);
    contextApi.disable();
    propagation.disable();
    trace.disable();
  });

  it("uses the platform root when the delegate has no active span", () => {
    expect(trace.getSpanContext(manager.active())).toEqual({
      ...platformRoot,
      isRemote: true,
    });
  });

  it("does not overwrite an active application span", () => {
    const applicationSpan: SpanContext = {
      traceId: "33333333333333333333333333333333",
      spanId: "4444444444444444",
      traceFlags: TraceFlags.SAMPLED,
    };
    delegate.activeContext = trace.setSpanContext(
      ROOT_CONTEXT,
      applicationSpan,
    );

    expect(manager.active()).toBe(delegate.activeContext);
    expect(trace.getSpanContext(manager.active())).toEqual(applicationSpan);
  });

  it("returns the delegate context without a Vercel request context", () => {
    currentRequestContext = undefined;

    expect(manager.active()).toBe(delegate.activeContext);
  });

  it("returns the delegate context without a platform root", () => {
    currentRequestContext = createRequestContext();

    expect(manager.active()).toBe(delegate.activeContext);
  });

  it("returns the delegate context when request-context lookup throws", () => {
    Object.defineProperty(globalThis, requestContextSymbol, {
      configurable: true,
      value: {
        get: () => {
          throw new Error("lookup failed");
        },
      },
    });

    expect(manager.active()).toBe(delegate.activeContext);
  });

  it("returns the delegate context when context mutation throws", () => {
    const mutationError = new Error("mutation failed");
    const throwingContext: Context = {
      getValue: () => undefined,
      setValue: () => {
        throw mutationError;
      },
      deleteValue: () => throwingContext,
    };
    delegate.activeContext = throwingContext;

    expect(manager.active()).toBe(throwingContext);
  });

  it("preserves an explicit unsampled trace flag", () => {
    currentRequestContext = createRequestContext({
      ...platformRoot,
      traceFlags: TraceFlags.NONE,
    });

    expect(trace.getSpanContext(manager.active())?.traceFlags).toBe(
      TraceFlags.NONE,
    );
  });

  it("delegates with, bind, enable, and disable", () => {
    const receiver = { offset: 3 };
    function add(this: typeof receiver, value: number): number {
      return this.offset + value;
    }
    const target = { target: true };

    expect(manager.with(ROOT_CONTEXT, add, receiver, 2)).toBe(5);
    expect(delegate.withCall).toEqual({
      context: ROOT_CONTEXT,
      fn: add,
      thisArg: receiver,
      args: [2],
    });
    expect(manager.bind(ROOT_CONTEXT, target)).toBe(target);
    expect(delegate.bindCall).toEqual({ context: ROOT_CONTEXT, target });
    expect(manager.enable()).toBe(manager);
    expect(manager.disable()).toBe(manager);
    expect(delegate.enableCalls).toBe(1);
    expect(delegate.disableCalls).toBe(1);
  });

  it("preserves delegate errors", () => {
    const error = new Error("delegate failed");

    expect(() =>
      manager.with(ROOT_CONTEXT, () => {
        throw error;
      }),
    ).toThrow(error);
  });

  it("isolates concurrent roots across async boundaries", async () => {
    const requestStorage = new AsyncLocalStorage<VercelRequestContext>();
    const asyncDelegate = new AsyncLocalStorageContextManager().enable();
    manager = new VercelRuntimeContextManager(asyncDelegate);
    Object.defineProperty(globalThis, requestContextSymbol, {
      configurable: true,
      value: { get: () => requestStorage.getStore() },
    });
    const firstRoot = platformRoot;
    const secondRoot: SpanContext = {
      traceId: "55555555555555555555555555555555",
      spanId: "6666666666666666",
      traceFlags: TraceFlags.SAMPLED,
    };

    const resolveAfterAsyncBoundary = async (
      rootSpanContext: SpanContext,
    ): Promise<SpanContext | undefined> =>
      requestStorage.run(createRequestContext(rootSpanContext), async () => {
        await Promise.resolve();
        return trace.getSpanContext(manager.active());
      });

    const [first, second] = await Promise.all([
      resolveAfterAsyncBoundary(firstRoot),
      resolveAfterAsyncBoundary(secondRoot),
    ]);

    expect(first).toEqual({ ...firstRoot, isRemote: true });
    expect(second).toEqual({ ...secondRoot, isRemote: true });
    asyncDelegate.disable();
  });

  it("decorates the default Node.js context manager", async () => {
    const previousRuntime = process.env.NEXT_RUNTIME;
    delete process.env.NEXT_RUNTIME;
    const sdk = new Sdk({
      autoDetectResources: false,
      instrumentations: [],
      resourceDetectors: [],
      spanProcessors: [],
    });

    try {
      sdk.start();
      expect(trace.getSpanContext(contextApi.active())).toEqual({
        ...platformRoot,
        isRemote: true,
      });
    } finally {
      await sdk.shutdown();
      restoreNextRuntime(previousRuntime);
    }
  });

  it("decorates a user-supplied Node.js context manager", async () => {
    const previousRuntime = process.env.NEXT_RUNTIME;
    process.env.NEXT_RUNTIME = "nodejs";
    const sdk = new Sdk({
      autoDetectResources: false,
      contextManager: delegate,
      instrumentations: [],
      resourceDetectors: [],
      spanProcessors: [],
    });

    try {
      sdk.start();
      expect(trace.getSpanContext(contextApi.active())).toEqual({
        ...platformRoot,
        isRemote: true,
      });
    } finally {
      await sdk.shutdown();
      restoreNextRuntime(previousRuntime);
    }
  });

  it("does not decorate a user-supplied Edge context manager", async () => {
    const previousRuntime = process.env.NEXT_RUNTIME;
    process.env.NEXT_RUNTIME = "edge";
    const sdk = new Sdk({
      autoDetectResources: false,
      contextManager: delegate,
      instrumentations: [],
      resourceDetectors: [],
      spanProcessors: [],
    });

    try {
      sdk.start();
      expect(contextApi.active()).toBe(delegate.activeContext);
      expect(trace.getSpanContext(contextApi.active())).toBeUndefined();
    } finally {
      await sdk.shutdown();
      restoreNextRuntime(previousRuntime);
    }
  });
});

function createRequestContext(
  rootSpanContext?: SpanContext,
): VercelRequestContext {
  return {
    waitUntil: () => undefined,
    headers: {},
    url: "https://example.com/api/probe",
    telemetry: {
      reportSpans: () => undefined,
      rootSpanContext,
    },
  };
}

function restoreNextRuntime(runtime: string | undefined): void {
  if (runtime === undefined) {
    delete process.env.NEXT_RUNTIME;
  } else {
    process.env.NEXT_RUNTIME = runtime;
  }
}
