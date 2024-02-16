import { TraceFlags } from "@opentelemetry/api";

export function isSampled(traceFlags: number): boolean {
  // eslint-disable-next-line no-bitwise
  return (traceFlags & TraceFlags.SAMPLED) !== 0;
}
