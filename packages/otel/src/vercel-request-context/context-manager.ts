import type { Context, ContextManager } from "@opentelemetry/api";
import { TraceFlags, trace } from "@opentelemetry/api";
import { getVercelRequestContext } from "./api";

export class VercelRuntimeContextManager implements ContextManager {
  public constructor(private readonly delegate: ContextManager) {}

  public active(): Context {
    const activeContext = this.delegate.active();

    try {
      if (trace.getSpanContext(activeContext)) {
        return activeContext;
      }

      const rootSpanContext =
        getVercelRequestContext()?.telemetry?.rootSpanContext;
      if (!rootSpanContext) {
        return activeContext;
      }

      return trace.setSpanContext(activeContext, {
        ...rootSpanContext,
        isRemote: true,
        traceFlags: rootSpanContext.traceFlags ?? TraceFlags.SAMPLED,
      });
    } catch {
      return activeContext;
    }
  }

  public with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    context: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    return this.delegate.with(context, fn, thisArg, ...args);
  }

  public bind<T>(context: Context, target: T): T {
    return this.delegate.bind(context, target);
  }

  public enable(): this {
    this.delegate.enable();
    return this;
  }

  public disable(): this {
    this.delegate.disable();
    return this;
  }
}
