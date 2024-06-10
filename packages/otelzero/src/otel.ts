import type {
  Context as OtelContext,
  ContextManager as OtelContextManager,
  Span as OtelSpan,
  TracerProvider as OtelTracerProvider,
  TextMapPropagator as OtelPropagator,
  TextMapGetter,
  Meter as OtelMeter,
  MeterProvider as OtelMeterPropagator,
  TextMapSetter,
} from "@opentelemetry/api";
import { SpanStatusCode, type Span, type SpanOptions } from "./span";
import type { CarrierGetter, CarrierSetter } from "./carrier";
import {
  NO_SPAN,
  type TraceProvider,
  type SpanCallback,
  setTraceProvider,
} from "./trace";
import {
  type MeterProvider,
  type MeterOptions,
  setMeterProvider,
} from "./meter";

/** @internal */
export function installOtelSdkProviders(): void {
  const traceProvider: TraceProvider = {
    getActiveSpan() {
      const otelContextManager = getOtelContextManager();
      if (!otelContextManager) {
        return undefined;
      }
      return getOtelSpan(otelContextManager.active());
    },

    rootContext<T, C>(
      fn: () => T,
      carrier: C | undefined,
      getter: CarrierGetter<C> | undefined
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
    },

    injectContext<C>(
      span: Span | undefined | null,
      carrier: C,
      setter: CarrierSetter<C> | undefined
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
    },

    trace<T>(name: string, opts: SpanOptions, fn: SpanCallback<T>): T {
      return doSpan<T>(name, opts, fn);
    },

    startSpan(name: string, opts: SpanOptions, parent: Span | undefined): Span {
      const otelTraceProvider = getOtelTraceProvider();
      const otelContextManager = getOtelContextManager();
      if (!otelTraceProvider || !otelContextManager) {
        return NO_SPAN;
      }

      const { library, ...other } = opts;
      const channelName =
        (typeof library === "string" ? library : library?.name) || "default";

      let context = otelContextManager.active();
      if (parent) {
        context = setOtelSpan(context, parent);
      }

      const tracer = otelTraceProvider.getTracer(channelName);
      return tracer.startSpan(name, other, context);
    },
  };
  setTraceProvider(traceProvider);

  const meterProvider: MeterProvider = {
    counter(name: string, value: number, opts: MeterOptions): void {
      const meter = getMeter(opts);
      if (!meter) {
        return;
      }
      const { unit, attributes } = opts;
      const counter = meter.createCounter(name, {
        // TODO: more opts: valueType, etc.
        unit,
      });
      counter.add(value, attributes);
    },

    histogram(name: string, value: number, opts: MeterOptions): void {
      const meter = getMeter(opts);
      if (!meter) {
        return;
      }
      const { unit, attributes } = opts;
      const histogram = meter.createHistogram(name, {
        // TODO: more opts: valueType, etc.
        unit,
      });
      histogram.record(value, attributes);
    },
  };
  setMeterProvider(meterProvider);
}

function getMeter(opts: MeterOptions): OtelMeter | undefined {
  const otelMeterProvider = getOtelMeterProvider();
  if (!otelMeterProvider) {
    return undefined;
  }
  const { library } = opts;
  const channelName =
    (typeof library === "string" ? library : library?.name) || "default";
  return otelMeterProvider.getMeter(channelName);
}

function doSpan<T>(
  name: string,
  opts: SpanOptions & { root?: boolean },
  fn: SpanCallback<T>
): T {
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

function getOtelMeterProvider(): OtelMeterPropagator | undefined {
  return getOtelGlobal<OtelMeterPropagator>("metrics");
}

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

const GLOBAL_OPENTELEMETRY_API_KEY = Symbol.for("opentelemetry.js.api.1");

function getOtelGlobal<T>(type: string): T | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  return (globalThis as any)[GLOBAL_OPENTELEMETRY_API_KEY]?.[type] as
    | T
    | undefined;
}

const SPAN_KEY = Symbol.for("OpenTelemetry Context Key SPAN");

function getOtelSpan(context: OtelContext): OtelSpan | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return (context.getValue(SPAN_KEY) as OtelSpan) || undefined;
}

function setOtelSpan(context: OtelContext, span: OtelSpan): OtelContext {
  return context.setValue(SPAN_KEY, span);
}
