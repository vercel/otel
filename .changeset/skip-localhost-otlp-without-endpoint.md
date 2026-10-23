---
"@vercel/otel": patch
---

Skip the localhost OTLP exporter while the Vercel request context is exporting spans.
