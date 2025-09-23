/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import type {
  Context as OtelContext,
  ContextManager as OtelContextManager,
  Span as OtelSpan,
  TracerProvider as OtelTracerProvider,
  TextMapPropagator as OtelPropagator,
  TextMapGetter,
  TextMapSetter,
} from "@opentelemetry/api";
import type { CarrierGetter, CarrierSetter } from "./carrier";
import {
  SpanStatusCode,
  type Span,
  type SpanContext,
  type SpanOptions,
} from "./span";
import { getOtelGlobal } from "./otel";

export type SpanCallback<T> = (span: Span) => T;

export function rootTraceContext<T, Carrier = unknown>(
  fn: () => T,
  carrier?: Carrier,
  getter?: CarrierGetter<Carrier>
): T {
  return rootTraceContextImpl(fn, carrier, getter);
}

export function injectTraceContext<Carrier>(
  span: Span | undefined | null,
  carrier: Carrier,
  setter?: CarrierSetter<Carrier>
): void {
  injectTraceContextImpl(span, carrier, setter);
}

export function trace<T>(name: string, fn: SpanCallback<T>): T;

export function trace<T>(
  name: string,
  opts: SpanOptions,
  fn: SpanCallback<T>
): T;

export function trace<T>(
  name: string,
  optsOrFn: SpanOptions | SpanCallback<T>,
  maybeFn?: SpanCallback<T>
): T {
  const opts = typeof optsOrFn === "function" ? NO_OPTS : optsOrFn;
  const fn = typeof optsOrFn === "function" ? optsOrFn : maybeFn!;
  return traceImpl(name, opts, fn);
}

export function wrapTrace<F extends (...args: any[]) => any>(
  name: string,
  fn: F
): F;

export function wrapTrace<F extends (...args: any[]) => any>(
  name: string,
  opts: SpanOptions,
  fn: F
): F;

export function wrapTrace<F extends (...args: any[]) => any>(
  name: string,
  optsOrFn: SpanOptions | F,
  maybeFn?: F
): F {
  const opts = typeof optsOrFn === "function" ? NO_OPTS : optsOrFn;
  const fn = typeof optsOrFn === "function" ? optsOrFn : maybeFn!;
  return ((...args: Parameters<F>): ReturnType<F> =>
    trace(name, opts, () => fn(...args))) as F;
}

export function startSpan(
  name: string,
  opts?: SpanOptions,
  parent?: Span
): Span {
  const otelTraceProvider = getOtelTraceProvider();
  const otelContextManager = getOtelContextManager();
  if (!otelTraceProvider || !otelContextManager) {
    return NO_SPAN;
  }

  const { library, ...other } = opts ?? NO_OPTS;
  const channelName =
    (typeof library === "string" ? library : library?.name) || "default";

  let context = otelContextManager.active();
  if (parent) {
    context = setOtelSpan(context, parent);
  }

  const tracer = otelTraceProvider.getTracer(channelName);
  return tracer.startSpan(name, other, context);
}

export function getActiveSpan(): Span | undefined {
  const otelContextManager = getOtelContextManager();
  if (!otelContextManager) {
    return undefined;
  }
  return getOtelSpan(otelContextManager.active());
}

const NO_OPTS: SpanOptions = {};

const NO_CONTEXT: SpanContext = {
  traceId: "00000000000000000000000000000000",
  spanId: "0000000000000000",
  traceFlags: 0,
};

/** @internal */
const NO_SPAN: Span = {
  isRecording(): boolean {
    return false;
  },
  spanContext(): SpanContext {
    return NO_CONTEXT;
  },
  updateName(): Span {
    return this;
  },
  setAttribute(): Span {
    return this;
  },
  setAttributes(): Span {
    return this;
  },
  addEvent(): Span {
    return this;
  },
  addLink(): Span {
    return this;
  },
  addLinks(): Span {
    return this;
  },
  setStatus(): Span {
    return this;
  },
  end(): void {
    // no-op
  },
  recordException(): void {
    // no-op
  },
};

const defaultTextGetter: TextMapGetter<unknown> = {
  keys(carrier: unknown): string[] {
    if (carrier && typeof carrier === "object") {
      return Object.keys(carrier);
    }
    return [];
  },
  get(carrier: unknown, key: string): string | string[] | undefined {
    if (carrier && typeof carrier === "object") {
      return (carrier as Record<string, string | string[] | undefined>)[
        key
      ] as unknown as string | string[] | undefined;
    }
    return undefined;
  },
};

const defaultTextSetter: TextMapSetter<unknown> = {
  set(carrier, key, value) {
    if (carrier && typeof carrier === "object") {
      (carrier as Record<string, unknown>)[key] = value;
    }
  },
};

function rootTraceContextImpl<T, Carrier = unknown>(
  fn: () => T,
  carrier: Carrier | undefined,
  getter: CarrierGetter<Carrier> | undefined
): T {
  const otelPropagator = getOtelPropagator();
  const otelContextManager = getOtelContextManager();
  if (otelPropagator && otelContextManager) {
    let context = otelContextManager.active();
    context = context.deleteValue(SPAN_KEY);
    if (carrier) {
      context = otelPropagator.extract(
        context,
        carrier,
        getter ?? defaultTextGetter
      );
    }
    return otelContextManager.with(context, fn);
  }
  return fn();
}

function injectTraceContextImpl<Carrier>(
  span: Span | undefined | null,
  carrier: Carrier,
  setter?: CarrierSetter<Carrier>
): void {
  const otelPropagator = getOtelPropagator();
  const otelContextManager = getOtelContextManager();
  if (otelPropagator && otelContextManager) {
    let context = otelContextManager.active();
    if (span) {
      context = setOtelSpan(context, span);
    }
    otelPropagator.inject(context, carrier, setter ?? defaultTextSetter);
  }
}

function traceImpl<T>(name: string, opts: SpanOptions, fn: SpanCallback<T>): T {
  const otelTraceProvider = getOtelTraceProvider();
  if (!otelTraceProvider) {
    return fn(NO_SPAN);
  }

  const { library, ...other } = opts;
  const channelName =
    (typeof library === "string" ? library : library?.name) || "default";

  const tracer = otelTraceProvider.getTracer(channelName);
  return tracer.startActiveSpan(name, other, (span) => {
    try {
      const result = fn(span);
      if (!result || typeof result !== "object" || !("then" in result)) {
        endSpan(span);
        return result;
      }
      return Promise.resolve(result).then(
        (r) => {
          endSpan(span);
          return r;
        },
        (e) => {
          endSpan(span, e);
          throw e;
        }
      ) as T;
    } catch (e) {
      endSpan(span, e);
      throw e;
    }
  });
}

function endSpan(span: OtelSpan, error?: unknown): void {
  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    span.recordException(error instanceof Error ? error : message);
    span.setStatus({ code: SpanStatusCode.ERROR, message });
  }
  span.end();
}

function getOtelTraceProvider(): OtelTracerProvider | undefined {
  return getOtelGlobal<OtelTracerProvider>("trace");
}

function getOtelContextManager(): OtelContextManager | undefined {
  return getOtelGlobal<OtelContextManager>("context");
}

function getOtelPropagator(): OtelPropagator | undefined {
  return getOtelGlobal<OtelPropagator>("propagation");
}

const SPAN_KEY = Symbol.for("OpenTelemetry Context Key SPAN");

function getOtelSpan(context: OtelContext): OtelSpan | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return (context.getValue(SPAN_KEY) as OtelSpan) || undefined;
}

function setOtelSpan(context: OtelContext, span: OtelSpan): OtelContext {
  return context.setValue(SPAN_KEY, span);
}
