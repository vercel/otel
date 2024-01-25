# 🚀 Vercel Otel

[![npm](https://img.shields.io/npm/v/@vercel/otel.svg)](https://www.npmjs.com/package/@vercel/otel)

> **Note:** This package is experimental. It doesn't follow semver yet. Minors can contain breaking changes.

`@vercel/otel` is a simple and easy-to-use package that sets up your tracing configuration.

💡 Use this package to quickly instrument your applications and get started with OpenTelemetry!

## 📦 Installation

```sh
npm install @vercel/otel
```

## 📚 Usage

```javascript
import { registerOTel } from "@vercel/otel";
import { trace } from "@opentelemetry/api";

// Register the OpenTelemetry.
registerOTel("your-service-name");

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
- `attributes`: The resource attributes. By default, `@vercel/otel` configures relevant Vercel attributes based on [the environment](https://vercel.com/docs/projects/environment-variables/system-environment-variables), such as `vercel.env`, `vercel.runtime`, `vercel.host`, etc.
- `instrumentations`: A set of instrumentations. By default, `@vercel/otel` configures "fetch" instrumentation.
- `instrumentationConfig`: Customize configuration for predefined instrumentations, such as "fetch".
- `propagators`: A set of propagators that may extend inbound and outbound contexts. By default, `@vercel/otel` configures [W3C Trace Context](https://www.w3.org/TR/trace-context/) propagator.
- `traceSampler`: The sampler to be used to decide which requests should be traced. By default, all requests are traced. This option can be changed to, for instance, only trace 1% of all requests.
- `spanProcessors` and `traceExporter`: The export mechanism for traces. By default, `@vercel/otel` configures the best export mechanism for the environment. For instance, if a [tracing integrations](https://vercel.com/docs/observability/otel-overview/quickstart) is configured on Vercel, this integration will be automatically used for export; otherwise an [OTLP exporter](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/#otlp-exporter) can be used if configured in environment variables.

See API for more details.

## 📄 License

[MIT](LICENSE)

---

Made with 💖 by Vercel. Happy tracing! 📈
