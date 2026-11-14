---
"@vercel/otel": minor
---

Add a `propagateUnsampledContext` option to the fetch instrumentation. When it is on, `fetch` and `http`/`https` requests whose span is not sampled still send the tracing context, such as a `traceparent` header ending in `-00`, so downstream services follow the sampling decision instead of starting a new trace. No span is exported for these requests, and `propagateContextUrls` and `dontPropagateContextUrls` still apply. It is off by default. Turn it on with `instrumentationConfig: { fetch: { propagateUnsampledContext: true } }`.

A `fetch(..., { opentelemetry: { propagateContext: false } })` call now skips propagation. Before, `false` was ignored and the URL rules decided.
