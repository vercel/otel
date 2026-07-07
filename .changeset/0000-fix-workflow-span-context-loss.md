---
"@vercel/otel": patch
---

Fix long-running (e.g. Vercel Workflow) traces dropping spans from the first half of the run. Periodic span flushes now run inside the request context instead of relying on the BatchSpanProcessor's wall-clock timer (which escaped the request's AsyncLocalStorage), and the runtime exporter now retains and retries batches instead of silently dropping them when the request context is momentarily unavailable.
