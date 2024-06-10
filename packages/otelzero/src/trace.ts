/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import type { CarrierGetter, CarrierSetter } from "./carrier";
import type { Span, SpanContext, SpanOptions } from "./span";

export type SpanCallback<T> = (span: Span) => T;

export function rootTraceContext<T, Carrier = unknown>(
  fn: () => T,
  carrier?: Carrier,
  getter?: CarrierGetter<Carrier>
): T {
  const provider = getTraceProvider();
  if (provider) {
    return provider.rootContext(fn, carrier, getter);
  }
  return fn();
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
  const provider = getTraceProvider();
  if (provider) {
    return provider.trace(name, opts, fn);
  }
  return fn(NO_SPAN);
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
  const provider = getTraceProvider();
  return provider?.startSpan(name, opts ?? NO_OPTS, parent) ?? NO_SPAN;
}

export function getActiveSpan(): Span | undefined {
  const provider = getTraceProvider();
  return provider?.getActiveSpan();
}

export function injectTraceContext<Carrier>(
  span: Span | undefined | null,
  carrier: Carrier,
  setter?: CarrierSetter<Carrier>
): void {
  const provider = getTraceProvider();
  provider?.injectContext(span, carrier, setter);
}

const NO_OPTS: SpanOptions = {};

export interface TraceProvider {
  rootContext: <T, C>(
    fn: () => T,
    carrier: C | undefined,
    getter: CarrierGetter<C> | undefined
  ) => T;

  trace: <T>(name: string, opts: SpanOptions, fn: SpanCallback<T>) => T;

  startSpan: (
    name: string,
    opts: SpanOptions,
    parent: Span | undefined
  ) => Span;

  getActiveSpan: () => Span | undefined;

  injectContext: <Carrier>(
    span: Span | undefined | null,
    carrier: Carrier,
    setter: CarrierSetter<Carrier> | undefined
  ) => void;
}

/** @internal */
export function getTraceProvider(): TraceProvider | undefined {
  return (globalThis as any)[traceProviderSymbol];
}

export function setTraceProvider(provider: TraceProvider | undefined): void {
  (globalThis as any)[traceProviderSymbol] = provider;
}

const traceProviderSymbol = Symbol.for("otelzero/traceProvider");

const NO_CONTEXT: SpanContext = {
  traceId: "00000000000000000000000000000000",
  spanId: "0000000000000000",
  traceFlags: 0,
};

/** @internal */
export const NO_SPAN: Span = {
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
