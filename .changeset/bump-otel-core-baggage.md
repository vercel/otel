---
"@vercel/otel": patch
---

Upgrade the OpenTelemetry dependencies as a coordinated set so the bundled `W3CBaggagePropagator` limits inbound `baggage` headers. Stable packages use 2.8.0 and experimental packages use 0.219.0; both sets depend on the patched `@opentelemetry/core` 2.8.0. Earlier versions parsed every entry without a limit ([GHSA-8988-4f7v-96qf](https://github.com/open-telemetry/opentelemetry-js/security/advisories/GHSA-8988-4f7v-96qf), CVE-2026-54285).
