import type {
  BatchObservableCallback,
  Counter,
  Histogram,
  Meter,
  MeterOptions,
  MeterProvider,
  MetricOptions,
  Observable,
  ObservableCounter,
  ObservableGauge,
  ObservableUpDownCounter,
  UpDownCounter,
} from "@opentelemetry/api";
import type { Attributes } from "./api";

export interface Metric {
  type: "counter" | "histogram";
  name: string;
  value: number;
  units: string | undefined;
  attributes: Attributes | undefined;
}

export class MeterRecorder implements MeterProvider {
  public readonly metrics: Metric[] = [];
  private meters = new Map<string, MeterImpl>();

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  getMeter(name: string, version?: string, options?: MeterOptions): Meter {
    return alloc(
      this.meters,
      name,
      () => new MeterImpl(this.metrics, name, version, options)
    );
  }
}

class MeterImpl implements Meter {
  private readonly instruments = new Map<
    string,
    Histogram | Counter | UpDownCounter
  >();

  constructor(
    private metrics: Metric[],
    private name: string,
    private version: string | undefined,
    private options: MeterOptions | undefined
  ) {}

  createHistogram<AttributesTypes extends Attributes = Attributes>(
    name: string,
    options?: MetricOptions | undefined
  ): Histogram<AttributesTypes> {
    return alloc(
      this.instruments,
      name,
      () => new HistogramImpl(this.metrics, name, options)
    ) as Histogram<AttributesTypes>;
  }

  createCounter<AttributesTypes extends Attributes = Attributes>(
    name: string,
    options?: MetricOptions | undefined
  ): Counter<AttributesTypes> {
    return alloc(
      this.instruments,
      name,
      () => new CounterImpl(this.metrics, name, options)
    ) as Counter<AttributesTypes>;
  }

  createUpDownCounter<AttributesTypes extends Attributes = Attributes>(
    name: string,
    options?: MetricOptions | undefined
  ): UpDownCounter<AttributesTypes> {
    return alloc(
      this.instruments,
      name,
      () => new CounterImpl(this.metrics, name, options)
    ) as UpDownCounter<AttributesTypes>;
  }

  createObservableGauge<AttributesTypes extends Attributes = Attributes>(
    _name: string,
    _options?: MetricOptions | undefined
  ): ObservableGauge<AttributesTypes> {
    throw new Error("Method not implemented.");
  }

  createObservableCounter<AttributesTypes extends Attributes = Attributes>(
    _name: string,
    _options?: MetricOptions | undefined
  ): ObservableCounter<AttributesTypes> {
    throw new Error("Method not implemented.");
  }

  createObservableUpDownCounter<
    AttributesTypes extends Attributes = Attributes,
  >(
    _name: string,
    _options?: MetricOptions | undefined
  ): ObservableUpDownCounter<AttributesTypes> {
    throw new Error("Method not implemented.");
  }

  addBatchObservableCallback<AttributesTypes extends Attributes = Attributes>(
    _callback: BatchObservableCallback<AttributesTypes>,
    _observables: Observable<AttributesTypes>[]
  ): void {
    throw new Error("Method not implemented.");
  }

  removeBatchObservableCallback<
    AttributesTypes extends Attributes = Attributes,
  >(
    _callback: BatchObservableCallback<AttributesTypes>,
    _observables: Observable<AttributesTypes>[]
  ): void {
    throw new Error("Method not implemented.");
  }
}

class HistogramImpl implements Histogram {
  constructor(
    private metrics: Metric[],
    private name: string,
    private options: MetricOptions | undefined
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

class CounterImpl implements Counter, UpDownCounter {
  constructor(
    private metrics: Metric[],
    private name: string,
    private options: MetricOptions | undefined
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
