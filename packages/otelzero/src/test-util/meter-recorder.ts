import type {
  BatchObservableCallback as OtelBatchObservableCallback,
  Counter as OtelCounter,
  Histogram as OtelHistogram,
  Meter as OtelMeter,
  MeterOptions as OtelMeterOptions,
  MeterProvider as OtelMeterProvider,
  MetricOptions as OtelMetricOptions,
  Observable as OtelObservable,
  ObservableCounter as OtelObservableCounter,
  ObservableGauge as OtelObservableGauge,
  ObservableUpDownCounter as OtelObservableUpDownCounter,
  UpDownCounter as OtelUpDownCounter,
  Gauge as OtelGauge,
} from "@opentelemetry/api";
import type { Attributes } from "../attribute";

export interface Metric {
  type: "counter" | "histogram";
  name: string;
  value: number;
  units: string | undefined;
  attributes: Attributes | undefined;
}

export class MeterRecorder implements OtelMeterProvider {
  public readonly metrics: Metric[] = [];
  private meters = new Map<string, MeterImpl>();

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  getMeter(
    name: string,
    version?: string,
    options?: OtelMeterOptions
  ): OtelMeter {
    return alloc(
      this.meters,
      name,
      () => new MeterImpl(this.metrics, name, version, options)
    );
  }
}

class MeterImpl implements OtelMeter {
  private readonly instruments = new Map<
    string,
    OtelHistogram | OtelCounter | OtelUpDownCounter
  >();

  constructor(
    private metrics: Metric[],
    private name: string,
    private version: string | undefined,
    private options: OtelMeterOptions | undefined
  ) {}

  createHistogram<AttributesTypes extends Attributes = Attributes>(
    name: string,
    options?: OtelMetricOptions | undefined
  ): OtelHistogram<AttributesTypes> {
    return alloc(
      this.instruments,
      name,
      () => new HistogramImpl(this.metrics, name, options)
    ) as OtelHistogram<AttributesTypes>;
  }

  createCounter<AttributesTypes extends Attributes = Attributes>(
    name: string,
    options?: OtelMetricOptions | undefined
  ): OtelCounter<AttributesTypes> {
    return alloc(
      this.instruments,
      name,
      () => new CounterImpl(this.metrics, name, options)
    ) as OtelCounter<AttributesTypes>;
  }

  createUpDownCounter<AttributesTypes extends Attributes = Attributes>(
    name: string,
    options?: OtelMetricOptions | undefined
  ): OtelUpDownCounter<AttributesTypes> {
    return alloc(
      this.instruments,
      name,
      () => new CounterImpl(this.metrics, name, options)
    ) as OtelUpDownCounter<AttributesTypes>;
  }

  createGauge<AttributesTypes extends Attributes = Attributes>(
    _name: string,
    _options?: OtelMetricOptions | undefined
  ): OtelGauge<AttributesTypes> {
    throw new Error("Method not implemented.");
  }

  createObservableGauge<AttributesTypes extends Attributes = Attributes>(
    _name: string,
    _options?: OtelMetricOptions | undefined
  ): OtelObservableGauge<AttributesTypes> {
    throw new Error("Method not implemented.");
  }

  createObservableCounter<AttributesTypes extends Attributes = Attributes>(
    _name: string,
    _options?: OtelMetricOptions | undefined
  ): OtelObservableCounter<AttributesTypes> {
    throw new Error("Method not implemented.");
  }

  createObservableUpDownCounter<
    AttributesTypes extends Attributes = Attributes,
  >(
    _name: string,
    _options?: OtelMetricOptions | undefined
  ): OtelObservableUpDownCounter<AttributesTypes> {
    throw new Error("Method not implemented.");
  }

  addBatchObservableCallback<AttributesTypes extends Attributes = Attributes>(
    _callback: OtelBatchObservableCallback<AttributesTypes>,
    _observables: OtelObservable<AttributesTypes>[]
  ): void {
    throw new Error("Method not implemented.");
  }

  removeBatchObservableCallback<
    AttributesTypes extends Attributes = Attributes,
  >(
    _callback: OtelBatchObservableCallback<AttributesTypes>,
    _observables: OtelObservable<AttributesTypes>[]
  ): void {
    throw new Error("Method not implemented.");
  }
}

class HistogramImpl implements OtelHistogram {
  constructor(
    private metrics: Metric[],
    private name: string,
    private options: OtelMetricOptions | undefined
  ) {}

  record(value: number, attributes?: Attributes, _context?: unknown): void {
    this.metrics.push({
      type: "histogram",
      name: this.name,
      value,
      units: this.options?.unit,
      attributes,
    });
  }
}

class CounterImpl implements OtelCounter, OtelUpDownCounter {
  constructor(
    private metrics: Metric[],
    private name: string,
    private options: OtelMetricOptions | undefined
  ) {}

  add(value: number, attributes?: Attributes, _context?: unknown): void {
    this.metrics.push({
      type: "counter",
      name: this.name,
      value,
      units: this.options?.unit,
      attributes,
    });
  }
}

function alloc<T>(
  map: Map<string, T>,
  key: string,
  create: (key: string) => T
): T {
  let value = map.get(key);
  if (value === undefined) {
    value = create(key);
    map.set(key, value);
  }
  return value;
}
