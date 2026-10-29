# Astro OpenTelemetry context propagation

Minimal Astro SSR app that attaches application spans to Vercel platform traces.

## How it works

`instrumentation.ts` contains the complete `@vercel/otel` setup. Astro's middleware imports that file because the Astro Vercel adapter does not load the root instrumentation hook automatically. The middleware then extracts inbound context and runs the rest of the request inside it. `GET /api/trace` creates a span and returns its IDs. The home page button calls that route and displays its response.

Keep the default `@vercel/otel` propagators. The Vercel runtime propagator reads the platform parent when middleware calls `propagation.extract()`.

## Deploy

```sh
pnpm dlx vercel
```

Request `/api/trace` on the deployment. In the Vercel trace waterfall, confirm:

- `astro.request /api/trace` is a child of the platform `Invoke Function` span.
- `astro.api.trace` is a child of `astro.request /api/trace` on the same trace.

The middleware runs for server-rendered requests. A prerendered static page has no runtime request to trace.
