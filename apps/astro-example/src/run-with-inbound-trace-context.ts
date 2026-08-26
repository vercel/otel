import { context, propagation } from "@opentelemetry/api";

export function runWithInboundTraceContext<T>(
  headers: Headers,
  callback: () => T,
): T {
  const inboundContext = propagation.extract(
    context.active(),
    Object.fromEntries(headers.entries()),
  );

  return context.with(inboundContext, callback);
}
