---
"@vercel/otel": patch
---

Processors in `spanProcessors` now get `onEnding`, so they can change a span's attributes before any exporter sees it. This includes the `'auto'` exporters. Before, `onEnding` never ran. The bundled `BasicTracerProvider` came from `@opentelemetry/sdk-trace-base` 2.1.0, which never calls it, and `@vercel/otel` didn't forward it to your processors. The bundled OpenTelemetry SDK is now 2.3.0 (experimental packages 0.209.0).

With that SDK, OTLP JSON output now includes the `flags` field on spans and links. This covers spans sent through the Vercel request context (`reportSpans`) and the `http/json` exporter. The value is the W3C trace flags plus OTLP's "has is-remote" bit, and the "is remote" bit when the parent or link is remote. A sampled local span sends `257` and a sampled span with a remote parent sends `769`. The `http/protobuf` output doesn't change.
