---
"@vercel/otel": minor
---

Limit how long span exports can keep a function running.

- OTLP export requests abort after 10s by default. Change it with `timeoutMillis` on `OTLPHttpProtoTraceExporter` or `OTLPHttpJsonTraceExporter`, or with `OTEL_EXPORTER_OTLP_TRACES_TIMEOUT` and `OTEL_EXPORTER_OTLP_TIMEOUT`, in milliseconds, so `10` means 10ms.
- The flush queued in `waitUntil` gives up after 10s. Change it with the new `flushTimeoutMillis` option in `registerOTel`.
- An export that fails before sending reports the failure right away instead of stalling for 30s.
