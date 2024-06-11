import type {
  Meter as OtelMeter,
  MeterProvider as OtelMeterPropagator,
} from "@opentelemetry/api";
import type { Attributes } from "./attribute";
import { getOtelGlobal } from "./otel";

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
  const meter = getMeter(opts ?? NO_OPTS);
  if (!meter) {
    return;
  }
  const { unit, attributes } = opts ?? NO_OPTS;
  const counter = meter.createCounter(name, {
    // TODO: more opts: valueType, etc.
    unit,
  });
  counter.add(value, attributes);
}

export function meterHistogram(
  name: string,
  value: number,
  opts?: MeterOptions
): void {
  const meter = getMeter(opts ?? NO_OPTS);
  if (!meter) {
    return;
  }
  const { unit, attributes } = opts ?? NO_OPTS;
  const histogram = meter.createHistogram(name, {
    // TODO: more opts: valueType, etc.
    unit,
  });
  histogram.record(value, attributes);
}

const NO_OPTS: MeterOptions = {};

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

function getOtelMeterProvider(): OtelMeterPropagator | undefined {
  return getOtelGlobal<OtelMeterPropagator>("metrics");
}
