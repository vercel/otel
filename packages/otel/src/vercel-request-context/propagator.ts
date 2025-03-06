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
      diag.debug(
        "[BridgePropagator].extract() No Vercel request context found."
      );
      return context;
    }

    const { rootSpanContext } = vrc.telemetry;
    if (!rootSpanContext) {
      diag.debug(
        "[BridgePropagator].extract() No rootSpanContext found in Vercel request context."
      );
      return context;
    }

    diag.debug(
      "[BridgePropagator].extract() Extracted rootSpanContext from Vercel request context.",
      rootSpanContext
    );

    return tracing.setSpanContext(context, {
      ...rootSpanContext,
      isRemote: true,
      traceFlags: rootSpanContext.traceFlags || TraceFlags.SAMPLED,
    });
  }
}
