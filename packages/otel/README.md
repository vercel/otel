# 🚀 Vercel Otel

[![npm](https://img.shields.io/npm/v/@vercel/otel.svg)](https://www.npmjs.com/package/@vercel/otel)

`@vercel/otel` is a simple and easy-to-use package that sets up your tracing configuration.

💡 Use this package to quickly instrument your applications and get started with OpenTelemetry!

## 📦 Installation

```sh
npm install @vercel/otel @opentelemetry/api @opentelemetry/api-logs
```

## 📚 Usage

To configure OpenTelemetry SDK, call the `registerOTel` in the `instrumentation.ts`:

```javascript
import { registerOTel } from "@vercel/otel";

export function register() {
  // Register the OpenTelemetry.
  registerOTel("your-service-name");
}
```

To create custom spans in your code, use the OpenTelemetry API:

```javascript
import { trace } from "@opentelemetry/api";

// Now you can use the OpenTelemetry APIs
const span = trace.getTracer("your-component").startSpan("your-operation");
```

## 📖 API Reference

### `registerOTel(serviceName: string)`

Registers the OpenTelemetry SDK with the specified service name and the default configuration.

- `serviceName`: The name of your service, used as the app name in many OpenTelemetry backends.

### `registerOTel(config: Configuration)`

Registers the OpenTelemetry SDK with the specified configuration. Configuration options include:

- `serviceName`: The name of your service, used as the app name in many OpenTelemetry backends.
- `attributes`: The resource attributes. By default, `@vercel/otel` configures relevant Vercel attributes based on [the environment](https://vercel.com/docs/projects/environment-variables/system-environment-variables), such as `env`, `vercel.runtime`, `vercel.host`, etc.
- `instrumentations`: A set of instrumentations. By default, `@vercel/otel` configures "fetch" instrumentation.
- `instrumentationConfig`: Customize configuration for predefined instrumentations:
  - `fetch`: Customize configuration of the predefined "fetch" instrumentation:
    - `ignoreUrls`: A set of URL matchers (string prefix or regex) that should be ignored from tracing. By default all URLs are traced. Example: `fetch: { ignoreUrls: [/example.com/] }`.
    - `propagateContextUrls`: A set of URL matchers (string prefix or regex) for which the tracing context should be propagated (see `propagators`). By default the context is propagated _only_ for the [deployment URLs](https://vercel.com/docs/deployments/generated-urls), all other URLs should be enabled explicitly. Example: `fetch: { propagateContextUrls: [ /my.api/ ] }`.
    - `dontPropagateContextUrls`: A set of URL matchers (string prefix or regex) for which the tracing context should not be propagated (see `propagators`). This allows you to exclude a subset of URLs allowed by the `propagateContextUrls`.
    - `resourceNameTemplate`: A string for the "resource.name" attribute that can include attribute expressions in `{}`. Example: `fetch: { resourceNameTemplate: "{http.host}" }`.
    - The `fetch` instrumentation also allows the caller to pass relevant telemetry parameters via `fetch(..., { opentelemetry: {} })` argument (requires Next 14.1.1 or above), which may include the following fields:
      - `ignore: boolean`: overrides `ignoreUrls` for this call.
      - `propagateContext: boolean`: overrides `propagateContextUrls` for this call.
      - `spanName: string`: overrides the computed span name for this call.
      - `attributes: Attributes`: overrides the computed attributes for this call.
- `propagators`: A set of propagators that may extend inbound and outbound contexts. By default, `@vercel/otel` configures [W3C Trace Context](https://www.w3.org/TR/trace-context/) propagator.
- `traceSampler`: The sampler to be used to decide which requests should be traced. By default, all requests are traced. This option can be changed to, for instance, only trace 1% of all requests.
- `spanProcessors` and `traceExporter`: The export mechanism for traces. By default, `@vercel/otel` configures the best export mechanism for the environment. For instance, if a [tracing integrations](https://vercel.com/docs/observability/otel-overview) is configured on Vercel, this integration will be automatically used for export; otherwise an [OTLP exporter](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/#otlp-exporter) can be used if configured in environment variables.

See [API](https://otel.vercel.sh/api/) for more details.

## 📝 Changelog

See [CHANGELOG.md](https://otel.vercel.sh/CHANGELOG.md).

## 🔗 References

- [OpenTelemetry Primer](https://opentelemetry.io/docs/concepts/observability-primer/)
- [OpenTelemetry Environment Variables](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/)
- [Next.js OpenTelemetry docs](https://nextjs.org/docs/app/building-your-application/optimizing/open-telemetry)
- [Vercel OpenTelemetry Collector](https://vercel.com/docs/observability/otel-overview)

## 📄 License

[MIT](https://otel.vercel.sh/LICENSE)

---

Made with 💖 by Vercel. Happy tracing! 📈
