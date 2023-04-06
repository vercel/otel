# 🚀 Vercel Otel

[![npm](https://img.shields.io/npm/v/@vercel/otel.svg)](https://www.npmjs.com/package/@vercel/otel)

> **Note:** This package is experimental. Updates can contain breaking changes.

`vercel/otel` is a simple and easy-to-use package that sets up your trace provider and exporter.

💡 Use this package to quickly instrument your applications and get started with OpenTelemetry!

## 📦 Installation

```sh
npm install vercel/otel
```

## 📚 Usage

```javascript
import { registerOTel } from "vercel/otel";
import { trace } from "@opentelemetry/api";

// Register the OpenTelemetry provider with an HTTP exporter
registerOTel("your-service-name");

// Now you can use the OpenTelemetry APIs
const span = trace.getTracer("your-component").startSpan("your-operation");
```

## 📖 API Reference

### `registerOTel(serviceName: string)`

Registers the OpenTelemetry provider with an HTTP exporter using the given service name.
This is all that is needed to trace your app on Vercel.

- `serviceName`: The name of your service, used as the app name in many OpenTelemetry backends.

## 📄 License

[MIT](LICENSE)

---

Made with 💖 by Vercel. Happy tracing! 📈
