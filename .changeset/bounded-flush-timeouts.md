---
"@vercel/otel": patch
---

Limit how long span exports can keep a function running.

- OTLP export requests abort after `timeoutMillis`, 10s by default. `OTEL_EXPORTER_OTLP_TRACES_TIMEOUT` and `OTEL_EXPORTER_OTLP_TIMEOUT` also set it, in milliseconds, so `10` means 10ms.
- The flush queued in `waitUntil` gives up after 10s. Change it with the new `flushTimeoutMillis` option in `registerOTel`.
- An export that fails before sending reports the failure right away instead of stalling for 30s.
