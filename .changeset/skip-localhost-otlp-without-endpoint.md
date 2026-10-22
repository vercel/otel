---
"@vercel/otel": patch
---

Do not send traces to `http://localhost:4318/v1/traces` unless an OTLP endpoint is configured.
