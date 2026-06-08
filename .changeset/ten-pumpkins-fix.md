---
"@vercel/otel": patch
---

Add OpenTelemetry semantic convention resource attributes for Vercel defaults. `cloud.provider` is now set to `vercel`, and `cloud.region` continues to be emitted from `VERCEL_REGION`.

