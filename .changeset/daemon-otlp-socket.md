---
"@vercel/otel": minor
---

When `VERCEL_OTEL_SOCKET_PATH` is set and no OTLP endpoint is configured, the `'auto'` exporter sends traces over that Unix socket. Vercel Daemons use it to send traces to the daemon controller with no extra setup.
