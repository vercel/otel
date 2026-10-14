---
"@vercel/otel": patch
---

Fix spans being ended early when concurrent requests continue the same trace. Each request's root span now only ends the spans opened under that request, instead of every open span in the trace.
