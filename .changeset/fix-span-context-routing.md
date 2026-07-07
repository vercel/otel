---
"@vercel/otel": patch
---

Fix long-running invocations (e.g. Vercel Workflows) losing most spans from the first part of the run. The runtime only reliably persists one `reportSpans` payload per invocation, delivered through that invocation's own request context, while the BatchSpanProcessor flushed many times mid-run (from a bare `setTimeout` outside the request's AsyncLocalStorage) and shipped whole batches through whichever context was ambient. Spans are now attributed to the request context that owns their trace (captured at root-span start), accumulated per trace, and shipped in a single report when the trace is finalized from its own request's `waitUntil`. The processor also drains the BatchSpanProcessor queue in-context on span end so long runs cannot overflow it, and the exporter retains spans it cannot attribute instead of silently dropping them.
