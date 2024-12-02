---
"@vercel/otel": major
---

Use OpenTelemetry semantic convention attribute keys instead of custom vercel.\* attribute keys. This change is backward
incompatible. The following attribute keys have been changed:

Resource attributes:
 - `env` -> `deployment.environment`
 - `vercel.region` -> `cloud.region`
 - `vercel.runtime` -> `process.runtime.name`
 - `vercel.sha` -> `vcs.repository.ref.revision`

Span attributes:
 - `vercel.request_id` -> `faas.invocation_id`
 - `vercel.edge_region` -> `faas.invoked_region`

Furthermore, the following new resource attributes have been added:
 - `cloud.provider=vercel`