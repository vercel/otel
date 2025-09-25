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
    .map(v => v.trim())
    .filter(s => s !== "");
}