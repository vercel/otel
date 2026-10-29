import type { VercelRequestContext } from "./api";

/**
 * Per-traceId capture of the owning Vercel request context.
 *
 * Captured in `CompositeSpanProcessor.onStart` (which always runs in-request)
 * and used by the exporter to route each trace's spans through the request
 * that owns them. Concurrent invocations on one instance share the exporter,
 * and the runtime drops spans reported through a foreign invocation's channel.
 *
 * @internal
 */
const registry = new Map<string, VercelRequestContext>();

/** @internal */
export function setRequestContext(
  traceId: string,
  context: VercelRequestContext,
): void {
  registry.set(traceId, context);
}

/** @internal */
export function getRequestContext(
  traceId: string,
): VercelRequestContext | undefined {
  return registry.get(traceId);
}

/** @internal */
export function deleteRequestContext(traceId: string): void {
  registry.delete(traceId);
}
