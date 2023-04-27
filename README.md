# 🚀 Vercel Otel

[![npm](https://img.shields.io/npm/v/@vercel/otel.svg)](https://www.npmjs.com/package/@vercel/otel)

> **Note:** This package is experimental. It doesn't follow semver yet. Minors can contain breaking changes.

`@vercel/otel` is a simple and easy-to-use package that sets up your trace provider and exporter.

💡 Use this package to quickly instrument your applications and get started with OpenTelemetry!

## 📦 Installation

```sh
npm install @vercel/otel
```

## 📚 Usage

```javascript
import { registerOTel } from "@vercel/otel";
import { trace } from "@opentelemetry/api";

// Register the OpenTelemetry provider with an GRPC exporter
registerOTel("your-service-name");

// Now you can use the OpenTelemetry APIs
const span = trace.getTracer("your-component").startSpan("your-operation");
```

## 📖 API Reference

### `registerOTel(serviceName: string)`

Registers the OpenTelemetry provider with an OTLP exporter using the given service name.
This is all that is needed to trace your app on Vercel or any other platform exposing its own OpenTelemetry Collector.

- `serviceName`: The name of your service, used as the app name in many OpenTelemetry backends.

## 🧪 What exactly is this package doing

This package utilizes the [`exports`](https://nodejs.org/api/packages.html#exports) API, enabling us to import the OpenTelemetry SDK in Node only. When you import `registerOTel` in a file intended for the edge, it returns an empty function because OpenTelemetry doesn't support the edge. However, if you import the same function in a file designed for Node, you'll receive a standard function that sets up the OpenTelemetry SDK correctly.

The OpenTelemetry SDK initialization itself is straightforward. For more details, please see [the code](https://github.com/vercel/otel/blob/main/src/index.node.ts).

## 📄 License

[MIT](LICENSE)

---

Made with 💖 by Vercel. Happy tracing! 📈
