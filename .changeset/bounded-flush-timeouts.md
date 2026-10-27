---
"@vercel/otel": patch
---

Bound span export time so it cannot keep a function running until its max duration. OTLP export requests now abort after `timeoutMillis` (default 10s, or `OTEL_EXPORTER_OTLP_TRACES_TIMEOUT` / `OTEL_EXPORTER_OTLP_TIMEOUT`), the flush queued in `waitUntil` gives up after 10s, and `export()` always reports a result, including after shutdown or when serialization fails.
