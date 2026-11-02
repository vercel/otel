---
"@vercel/otel": patch
---

Processors in `spanProcessors` now receive `onEnding`. Use it to change or remove span attributes before any exporter sends the span, including the `'auto'` exporters.

The bundled OpenTelemetry SDK moves from 2.1.0 to 2.3.0, and its experimental packages from 0.205.0 to 0.209.0. SDK 2.1.0 never called `onEnding`.

OTLP JSON exports now include a `flags` field on each span and link. This affects spans sent to Vercel and the `http/json` exporter. A sampled span sends `257`, or `769` when its parent is remote. `http/protobuf` exports don't change.
