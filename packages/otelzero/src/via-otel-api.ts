import type {
  Meter as OtelMeter,
  Span as OtelSpan,
  Tracer,
} from "@opentelemetry/api";
import {
  ROOT_CONTEXT,
  SpanStatusCode,
  context as contextApi,
  metrics as metricsApi,
  propagation as propagationApi,
  trace as traceApi,
} from "@opentelemetry/api";
import type {
  Span,
  CarrierGetter,
  CarrierSetter,
  TraceProvider,
  SpanOptions,
  SpanCallback,
  MeterProvider,
  MeterOptions,
} from "./api";
import { setMeterProvider, setTraceProvider } from "./api";

export function installViaOtelApi(): void {
  const traceProvider: TraceProvider = {
    getActiveSpan() {
      return traceApi.getActiveSpan();
    },

    rootContext<T, C>(
      fn: () => T,
      carrier: C | undefined,
      getter: CarrierGetter<C> | undefined
    ): T {
      let context = ROOT_CONTEXT;
      if (carrier) {
        context = propagationApi.extract(context, carrier, getter);
      }
      return contextApi.with(context, fn);
    },

    injectContext<C>(
      span: Span | undefined | null,
      carrier: C,
      setter: CarrierSetter<C> | undefined
    ): void {
      let context = contextApi.active();
      if (span) {
        context = traceApi.setSpan(context, span);
      }
      propagationApi.inject(context, carrier, setter);
    },

    trace<T>(name: string, opts: SpanOptions, fn: SpanCallback<T>): T {
      return doSpan(name, opts, fn);
    },

    startSpan(name: string, opts: SpanOptions, parent: Span | undefined): Span {
      const tracer = getTracer(opts);
      let context = contextApi.active();
      if (parent) {
        context = traceApi.setSpan(context, parent);
      }
      return tracer.startSpan(name, opts, context);
    },
  };
  setTraceProvider(traceProvider);

  const meterProvider: MeterProvider = {
    counter(name: string, value: number, opts: MeterOptions): void {
      const { unit, attributes } = opts;
      const meter = getMeter(opts);
      const counter = meter.createCounter(name, {
        // TODO: more opts: valueType, etc.
        unit,
      });
      counter.add(value, attributes);
    },

    histogram(name: string, value: number, opts: MeterOptions): void {
      const { unit, attributes } = opts;
      const meter = getMeter(opts);
      const histogram = meter.createHistogram(name, {
        // TODO: more opts: valueType, etc.
        unit,
      });
      histogram.record(value, attributes);
    },
  };
  setMeterProvider(meterProvider);
}

function getMeter(opts: MeterOptions): OtelMeter {
  const { library } = opts;
  const channelName =
    (typeof library === "string" ? library : library?.name) || "default";
  return metricsApi.getMeter(channelName);
}

function getTracer(opts: SpanOptions): Tracer {
  const { library } = opts;
  const channelName =
    (typeof library === "string" ? library : library?.name) || "default";
  return traceApi.getTracer(channelName);
}

function doSpan<T>(name: string, opts: SpanOptions, fn: SpanCallback<T>): T {
  const { library: _library, ...other } = opts;
  const tracer = getTracer(opts);
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
