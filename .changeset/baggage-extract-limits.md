---
"@vercel/otel": patch
---

Fix [CVE-2026-54285](https://github.com/advisories/GHSA-8988-4f7v-96qf) in the `baggage` propagator. Inbound `baggage` headers are now capped at 180 entries and 8,192 bytes, and entries over 4,096 bytes are skipped. Before, every entry was parsed, however large the header.
