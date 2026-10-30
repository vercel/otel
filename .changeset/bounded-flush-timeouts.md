---
"@vercel/otel": minor
---

Add time limits to span exports.

- OTLP export requests now abort after 10s by default, on any platform. Before, they had no timeout. Change it with `timeoutMillis` on `OTLPHttpProtoTraceExporter` or `OTLPHttpJsonTraceExporter`, or with `OTEL_EXPORTER_OTLP_TRACES_TIMEOUT` and `OTEL_EXPORTER_OTLP_TIMEOUT`. `@vercel/otel` now reads those env vars, in milliseconds, so `10` means 10ms.
- On Vercel, the span flush queued in `waitUntil` gives up after 10s. Change it with the new `flushTimeoutMillis` option in `registerOTel`.
- An export that fails before sending reports the failure right away instead of stalling for 30s.
