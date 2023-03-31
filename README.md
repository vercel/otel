<!--
PROMPT for GPT-4:
Write me a README.md for package vercel/otel that helps people get started by setting up their exporter and trace provider for them and false bundles all OPen Telemetry apis in a single package.
It's not a powerful as using raw APIS, but It should be enough for most cases.

This package exports function `register()` that registers open telemetry provider with a HTTP exporter.
Register function takes one argument, it's string and it's a service name. It will be used as the app name in many OpenTelemetry backends.
This package also reexports `@opentelemetry/api` and `@opentelemetry/semantics`.

Use that hip style for Readme that many JS devs use. Keep it concise.
-->

# 🚀 Vercel Otel

[![npm](https://img.shields.io/npm/v/@vercel/otel.svg)](https://www.npmjs.com/package/@vercel/otel)

> **Note:** This package is experimental. Updates can contain breaking changes.

`vercel/otel` is a simple and easy-to-use package that sets up your trace provider and exporter, and bundles all OpenTelemetry APIs in a single package. It's not as powerful as using raw APIs, but it should be enough for most cases.

💡 Use this package to quickly instrument your applications and get started with OpenTelemetry!

## 📦 Installation

```sh
npm install vercel/otel
```

## 📚 Usage

```javascript
const { register, trace } = require("vercel/otel");

// Register the OpenTelemetry provider with an HTTP exporter
register("your-service-name");

// Now you can use the OpenTelemetry APIs
const span = trace.getTracer("your-component").startSpan("your-operation");
```

## 📖 API Reference

### `register(serviceName: string)`

Registers the OpenTelemetry provider with an HTTP exporter using the given service name.
This is all that is needed to trace your app on Vercel.

- `serviceName`: The name of your service, used as the app name in many OpenTelemetry backends.

### Re-exported APIs

This package re-exports everything from `@opentelemetry/api`. Refer to the official [OpenTelemetry API documentation](https://opentelemetry.io/docs/instrumentation/js/) for details on how to use these APIs.

## 📄 License

[MIT](LICENSE)

---

Made with 💖 by the Vercel. Happy tracing! 📈
