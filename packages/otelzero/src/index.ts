import { installOtelSdkProviders } from "./otel";

export type { Link, Span, SpanContext, SpanOptions, SpanStatus } from "./span";
export { SpanKind, SpanStatusCode } from "./span";
export type { Attributes, AttributeValue } from "./attribute";
export type { TimeInput, HrTime } from "./time";
export type { Exception } from "./exception";
export type { CarrierGetter, CarrierSetter } from "./carrier";
export {
  rootTraceContext,
  injectTraceContext,
  trace,
  wrapTrace,
  startSpan,
  getActiveSpan,
  setTraceProvider,
} from "./trace";
export type { TraceProvider } from "./trace";

export type { MeterProvider, MeterOptions } from "./meter";
export { meterCounter, meterHistogram, setMeterProvider } from "./meter";

installOtelSdkProviders();
