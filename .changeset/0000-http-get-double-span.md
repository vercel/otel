---
"@vercel/otel": patch
---

Fix duplicate spans for `http.get` and `https.get`. When the module's `get` calls the exported `request`, as it does in the Vercel runtime, each call recorded two spans for one request.
