---
"@vercel/otel": patch
---

Fix duplicate spans for `http.get` and `https.get`. If code that ran before `registerOTel` replaced `get` with a function that calls the exported `request`, each call recorded two spans for one request.
