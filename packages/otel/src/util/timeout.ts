import { diag } from "@opentelemetry/api";

/** Largest delay `setTimeout` supports. Larger values fire after 1ms. */
const MAX_TIMEOUT_MILLIS = 2 ** 31 - 1;

/**
 * Returns `undefined` for values `setTimeout` cannot honor, so the caller falls back to the next source.
 * @internal
 */
export function toTimeoutMillis(
  value: number | string | undefined,
  source: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const ms = typeof value === "string" ? Number(value) : value;
  if (Number.isFinite(ms) && ms > 0) {
    return Math.min(ms, MAX_TIMEOUT_MILLIS);
  }
  diag.warn(`@vercel/otel: ignoring invalid ${source}: ${String(value)}`);
  return undefined;
}
