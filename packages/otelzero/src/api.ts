// Equivalent of @opentelemetry/api Span.
export interface Span {
  spanContext: () => SpanContext;
  updateName: (name: string) => this;
  setAttribute: (key: string, value: AttributeValue) => this;
  setAttributes: (attributes: Attributes) => this;
  addEvent: (
    name: string,
    attributesOrStartTime?: Attributes | TimeInput,
    startTime?: TimeInput
  ) => this;
  setStatus: (status: SpanStatus) => this;
  end: (endTime?: TimeInput) => void;
  isRecording: () => boolean;
  recordException: (exception: Exception, time?: TimeInput) => void;
}

// Equivalent of @opentelemetry/api Exception.
export type Exception =
  | ExceptionWithCode
  | ExceptionWithMessage
  | ExceptionWithName
  | string;

interface ExceptionWithCode {
  code: string | number;
  name?: string;
  message?: string;
  stack?: string;
}

interface ExceptionWithMessage {
  code?: string | number;
  message: string;
  name?: string;
  stack?: string;
}

interface ExceptionWithName {
  code?: string | number;
  message?: string;
  name: string;
  stack?: string;
}

export const SPAN_KIND_INTERNAL = 0;
export const SPAN_KIND_SERVER = 1;
export const SPAN_KIND_CLIENT = 2;
export const SPAN_KIND_PRODUCER = 3;
export const SPAN_KIND_CONSUMER = 4;

export type SpanKind =
  | typeof SPAN_KIND_INTERNAL
  | typeof SPAN_KIND_SERVER
  | typeof SPAN_KIND_CLIENT
  | typeof SPAN_KIND_PRODUCER
  | typeof SPAN_KIND_CONSUMER;

export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  isRemote?: boolean;
  // traceState?: TraceState;
}

export interface SpanOptions {
  kind?: SpanKind;
  startTime?: TimeInput;
  attributes?: Attributes;
  links?: Link[];
  library?:
    | string
    | {
        name: string;
        version: string;
      };
}

export interface CarrierGetter<Carrier> {
  keys: (carrier: Carrier) => string[];
  get: (carrier: Carrier, key: string) => undefined | string | string[];
}

export interface CarrierSetter<Carrier> {
  set: (carrier: Carrier, key: string, value: string) => void;
}

export interface SpanStatus {
  code: SpanStatusCode;
  message?: string;
}

export const SPAN_STATUS_CODE_UNSET = 0;
export const SPAN_STATUS_CODE_OK = 1;
export const SPAN_STATUS_CODE_ERROR = 2;

export type SpanStatusCode =
  | typeof SPAN_STATUS_CODE_UNSET
  | typeof SPAN_STATUS_CODE_OK
  | typeof SPAN_STATUS_CODE_ERROR;

/**
 * Defines TimeInput.
 *
 * hrtime, epoch milliseconds, performance.now() or Date
 */
export type TimeInput = HrTime | number | Date;

/**
 * Defines High-Resolution Time.
 *
 * The first number, HrTime[0], is UNIX Epoch time in seconds since 00:00:00 UTC on 1 January 1970.
 * The second number, HrTime[1], represents the partial second elapsed since Unix Epoch time represented by first number in nanoseconds.
 * For example, 2021-01-01T12:30:10.150Z in UNIX Epoch time in milliseconds is represented as 1609504210150.
 * The first number is calculated by converting and truncating the Epoch time in milliseconds to seconds:
 * HrTime[0] = Math.trunc(1609504210150 / 1000) = 1609504210.
 * The second number is calculated by converting the digits after the decimal point of the subtraction, (1609504210150 / 1000) - HrTime[0], to nanoseconds:
 * HrTime[1] = Number((1609504210.150 - HrTime[0]).toFixed(9)) * 1e9 = 150000000.
 * This is represented in HrTime format as [1609504210, 150000000].
 */
export declare type HrTime = [number, number];

export type Attributes = Record<string, AttributeValue | undefined>;

export type AttributeValue =
  | string
  | number
  | boolean
  | (null | undefined | string)[]
  | (null | undefined | number)[]
  | (null | undefined | boolean)[];

export interface Link {
  context: SpanContext;
  attributes?: Attributes;
}

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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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

export interface MeterOptions {
  library?:
    | string
    | {
        name: string;
        version: string;
      };
  unit?: string;
  attributes?: Attributes;
}

export function meterCounter(
  name: string,
  value: number,
  opts?: MeterOptions
): void {
  const provider = getMeterProvider();
  return provider?.counter(name, value, opts ?? NO_METER_OPTS);
}

export function meterHistogram(
  name: string,
  value: number,
  opts?: MeterOptions
): void {
  const provider = getMeterProvider();
  return provider?.histogram(name, value, opts ?? NO_METER_OPTS);
}

// QQQQQ: obseverable metrics

const NO_OPTS: SpanOptions = {};
const NO_METER_OPTS = {};

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

export interface MeterProvider {
  counter: (name: string, value: number, opts: MeterOptions) => void;
  histogram: (name: string, value: number, opts: MeterOptions) => void;
}

const traceProviderSymbol = Symbol.for("otel0/traceProvider");

export function getTraceProvider(): TraceProvider | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  return (globalThis as any)[traceProviderSymbol];
}

export function setTraceProvider(provider: TraceProvider | undefined): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  (globalThis as any)[traceProviderSymbol] = provider;
}

const meterProviderSymbol = Symbol.for("otel0/meterProvider");

export function getMeterProvider(): MeterProvider | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  return (globalThis as any)[meterProviderSymbol];
}

export function setMeterProvider(provider: MeterProvider | undefined): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  (globalThis as any)[meterProviderSymbol] = provider;
}

const NO_CONTEXT: SpanContext = {
  traceId: "00000000000000000000000000000000",
  spanId: "0000000000000000",
  traceFlags: 0,
};

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
