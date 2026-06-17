---
"@vercel/otel": patch
---

Avoid local OTLP exports for drained Vercel traces when request context is lost before span end.
