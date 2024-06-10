import type { Attributes } from "./attribute";

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
  return provider?.counter(name, value, opts ?? NO_OPTS);
}

export function meterHistogram(
  name: string,
  value: number,
  opts?: MeterOptions
): void {
  const provider = getMeterProvider();
  return provider?.histogram(name, value, opts ?? NO_OPTS);
}

export interface MeterProvider {
  counter: (name: string, value: number, opts: MeterOptions) => void;
  histogram: (name: string, value: number, opts: MeterOptions) => void;
}

/** @internal */
export function getMeterProvider(): MeterProvider | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  return (globalThis as any)[meterProviderSymbol];
}

export function setMeterProvider(provider: MeterProvider | undefined): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  (globalThis as any)[meterProviderSymbol] = provider;
}

const NO_OPTS: MeterOptions = {};
const meterProviderSymbol = Symbol.for("otelzero/meterProvider");
