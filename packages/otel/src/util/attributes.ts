import type { Attributes } from "@opentelemetry/api";

/** @internal */
export function omitUndefinedAttributes<T extends Attributes = Attributes>(
  obj: T,
): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => value !== undefined),
  ) as T;
}
