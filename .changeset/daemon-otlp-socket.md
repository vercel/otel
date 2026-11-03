---
"@vercel/otel": minor
---

In a Vercel Daemon, the `'auto'` exporter sends traces to the daemon OTLP socket (`/var/run/vercel/o11y/otlp.sock`), so traces work with no extra setup. OTLP exporters also accept a new `socketPath` option to send export requests over a Unix socket in Node.js.
