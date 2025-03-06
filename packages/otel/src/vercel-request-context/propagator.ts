import type { Context, TextMapPropagator } from "@opentelemetry/api";
import { diag, TraceFlags, trace as tracing } from "@opentelemetry/api";
import { getVercelRequestContext } from "./api";

export class VercelRuntimePropagator implements TextMapPropagator {
  fields(): string[] {
    return [];
  }

  inject(): void {
    // Nothing.
  }

  extract(context: Context): Context {
    const vrc = getVercelRequestContext();
    if (!vrc?.telemetry) {
      diag.warn("@vercel/otel: Vercel telemetry extension not found.");
      return context;
    }

    const { rootSpanContext } = vrc.telemetry;
    if (!rootSpanContext) {
      return context;
    }

    diag.debug(
      "@vercel/otel: Extracted root SpanContext from Vercel request context.",
      rootSpanContext
    );
    return tracing.setSpanContext(context, {
      ...rootSpanContext,
      isRemote: true,
      traceFlags: rootSpanContext.traceFlags || TraceFlags.SAMPLED,
    });
  }
}
