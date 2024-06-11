const GLOBAL_OPENTELEMETRY_API_KEY = Symbol.for("opentelemetry.js.api.1");

/** @internal */
export function getOtelGlobal<T>(type: string): T | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  return (globalThis as any)[GLOBAL_OPENTELEMETRY_API_KEY]?.[type] as
    | T
    | undefined;
}
