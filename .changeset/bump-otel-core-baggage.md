---
"@vercel/otel": patch
---

Bundle `@opentelemetry/core` 2.8.0 so the bundled `W3CBaggagePropagator` limits inbound `baggage` headers. Earlier versions parsed every entry without a limit ([GHSA-8988-4f7v-96qf](https://github.com/open-telemetry/opentelemetry-js/security/advisories/GHSA-8988-4f7v-96qf), CVE-2026-54285).
