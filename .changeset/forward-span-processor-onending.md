---
"@vercel/otel": patch
---

Processors in `spanProcessors` now get `onEnding`, so they can change a span's attributes before any exporter sees it. This includes the `'auto'` exporters. Before, `onEnding` never ran. The bundled `BasicTracerProvider` came from `@opentelemetry/sdk-trace-base` 2.1.0, which never calls it, and `@vercel/otel` didn't forward it to your processors. The bundled OpenTelemetry SDK is now 2.3.0 (experimental packages 0.209.0).
