/**
 * TODO: Placeholder for the `@vercel/request-context-storage` package.
 * Replace with the real package once it's published.
 */

import type { SpanContext } from "@opentelemetry/api";

/** @internal */
export interface VercelRequestContext {
  waitUntil: (
    promiseOrFunc: Promise<unknown> | (() => Promise<unknown>),
  ) => void;
  headers: Record<string, string | undefined>;
  url: string;
  telemetry?: {
    reportSpans: (data: unknown) => void;
    rootSpanContext?: SpanContext;
    traceDrains?: string[];
  };
  [key: symbol]: unknown;
}

interface Reader {
  get: () => VercelRequestContext | undefined;
}

const symbol = Symbol.for("@vercel/request-context");

interface GlobalWithReader {
  [symbol]?: Reader;
}

/** @internal */
export function getVercelRequestContext(): VercelRequestContext | undefined {
  const reader = (globalThis as GlobalWithReader)[symbol];
  return reader?.get();
}

/**
 * Registry of request contexts keyed by trace id, so span exports can be
 * attributed to the request that OWNS each span instead of whichever request
 * happens to be ambient at flush time.
 *
 * Why this exists: the BatchSpanProcessor's queue is shared by every request
 * running on the function instance, and its scheduled flush runs in a bare
 * `setTimeout` OUTSIDE any request's AsyncLocalStorage. The runtime only
 * reliably persists spans reported through their own invocation's
 * `telemetry.reportSpans` channel, and only ONE report per invocation is
 * dependable (mid-run reports have been observed not to land). Long-running
 * invocations, e.g. Vercel Workflows, used to lose every span that was
 * flushed mid-run: their traces looked blank except for the last few seconds.
 *
 * The context is captured per trace while inside the owning request (root
 * span `onStart`), spans for registered traces are accumulated by the
 * exporter, and the trace's whole buffer is shipped in a single report by
 * `finalizeTrace` (invoked from the request's `waitUntil`, after the final
 * flush). A hard cap bounds the registry against traces whose root span
 * never ends.
 */
const traceContextRegistry = new Map<string, VercelRequestContext>();

const MAX_REGISTRY_SIZE = 1024;

type TraceFinalizer = (traceId: string) => void;

/** Callbacks (e.g. the runtime span exporter) shipping a trace's buffer. */
const traceFinalizers = new Set<TraceFinalizer>();

/** @internal Register a callback invoked when a trace is finalized. */
export function onTraceFinalize(finalizer: TraceFinalizer): void {
  traceFinalizers.add(finalizer);
}

/** @internal Capture the request context that owns a given trace. */
export function registerVercelRequestContextForTrace(
  traceId: string,
  context: VercelRequestContext,
): void {
  if (
    traceContextRegistry.size >= MAX_REGISTRY_SIZE &&
    !traceContextRegistry.has(traceId)
  ) {
    // Evict the oldest entry (Map preserves insertion order) so a leak of
    // never-ending traces cannot grow the registry unboundedly.
    const oldest: string | undefined = traceContextRegistry.keys().next()
      .value as string | undefined;
    if (oldest !== undefined) {
      traceContextRegistry.delete(oldest);
    }
  }
  traceContextRegistry.set(traceId, context);
}

/** @internal Whether a trace has a captured owning context. */
export function hasVercelRequestContextForTrace(traceId: string): boolean {
  return traceContextRegistry.has(traceId);
}

/** @internal Resolve the request context that owns a trace. */
export function getVercelRequestContextForTrace(
  traceId: string,
): VercelRequestContext | undefined {
  return traceContextRegistry.get(traceId);
}

/**
 * @internal Ship a trace's accumulated spans (via the registered finalizers)
 * and drop its captured context. Called from the owning request's
 * `waitUntil` after the final flush, so the single report this produces is
 * sent while the invocation is still able to deliver telemetry.
 */
export function finalizeTrace(traceId: string): void {
  try {
    for (const finalizer of traceFinalizers) {
      finalizer(traceId);
    }
  } finally {
    traceContextRegistry.delete(traceId);
  }
}