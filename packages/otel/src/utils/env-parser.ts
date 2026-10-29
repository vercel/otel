import { diag } from "@opentelemetry/api";

/**
 * This functions have been copied from the `@opentelemetry/core` package
 * as using it directly causes issues with the Edge runtime.
 */

/** @internal */
export function getStringFromEnv(key: string): string | undefined {
  const raw = process.env[key];
  if (!raw || raw.trim() === "") {
    return undefined;
  }
  return raw;
}

/** @internal */
export function getStringListFromEnv(key: string): string[] | undefined {
  return getStringFromEnv(key)
    ?.split(",")
    .map((v) => v.trim())
    .filter((s) => s !== "");
}

/** @internal */
export function getNumberFromEnv(key: string): number | undefined {
  const raw = getStringFromEnv(key);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    diag.warn(
      `@vercel/otel: ${key}=${raw} is not a non-negative integer, ignoring it.`,
    );
    return undefined;
  }
  return value;
}
