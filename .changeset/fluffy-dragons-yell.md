---
"@vercel/otel": minor
---

Ignore auto-configuration based on the OTEL*EXPORTER_OTLP* env vars when trace drains are used. This avoids duplicate trace export.
