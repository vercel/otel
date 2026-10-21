---
"@vercel/otel": major
---

Add support for OpenTelemetry JS SDK 3.x.

`@vercel/otel` 3.x works with SDK 3.x only. SDK 2.x users stay on `@vercel/otel` 2.x, which is maintained on the `v2.x` branch.

### Requirements

- Node.js `>=22.15.0`, the minimum for SDK 3.x.
- `@opentelemetry/api` `>=1.10.0 <1.11.0`.

### Peer dependency changes

| Package | 2.x | 3.x |
| --- | --- | --- |
| `@opentelemetry/api` | `>=1.9.0 <2.0.0` | `>=1.10.0 <1.11.0` |
| `@opentelemetry/sdk-trace-base` | `>=2.0.0 <3.0.0` | removed, use `@opentelemetry/sdk-trace` |
| `@opentelemetry/sdk-trace` | none | `>=3.0.0 <4.0.0` |
| `@opentelemetry/api-logs` | `>=0.200.0 <0.300.0` | removed, folded into `@opentelemetry/api` |
| `@opentelemetry/sdk-logs` | `>=0.200.0 <0.300.0` | `>=3.0.0 <4.0.0` |
| `@opentelemetry/sdk-metrics` | `>=2.0.0 <3.0.0` | `>=3.0.0 <4.0.0` |
| `@opentelemetry/resources` | `>=2.0.0 <3.0.0` | `>=3.0.0 <4.0.0` |
| `@opentelemetry/instrumentation` | `>=0.200.0 <0.300.0` | `>=0.300.0 <0.400.0` |

```sh
npm uninstall @opentelemetry/sdk-trace-base @opentelemetry/api-logs
npm install @vercel/otel@3 @opentelemetry/api@^1.10.0 @opentelemetry/sdk-trace@^3 \
  @opentelemetry/sdk-logs@^3 @opentelemetry/sdk-metrics@^3 @opentelemetry/resources@^3 \
  @opentelemetry/instrumentation@^0.300
```

### Migrating your code

`registerOTel(...)` and every `Configuration` option are unchanged. Only code that builds SDK objects itself needs edits.

Span processors now take an options object.

```ts
// before
import { BatchSpanProcessor, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
new BatchSpanProcessor(exporter);
new SimpleSpanProcessor(exporter);

// after
import { BatchSpanProcessor, SimpleSpanProcessor } from "@opentelemetry/sdk-trace";
new BatchSpanProcessor({ exporter });
new SimpleSpanProcessor({ exporter });
```

The logs API is now in `@opentelemetry/api`.

```ts
// before
import { logs } from "@opentelemetry/api-logs";
// after
import { logs } from "@opentelemetry/api";
```

A library that still emits logs through `@opentelemetry/api-logs` 0.2xx does not reach the processors you pass in `logRecordProcessors`. Upgrade it to a release built for `@opentelemetry/api` 1.10.

The types re-exported from `@vercel/otel`, such as `SpanProcessor`, `SpanExporter`, `Sampler`, `IdGenerator` and `SpanLimits`, now come from `@opentelemetry/sdk-trace`.

### Environment variables

SDK 3.x no longer reads these variables itself. `@vercel/otel` reads them and applies them to the tracer provider, logger provider and batch span processors it creates:

- `OTEL_BSP_SCHEDULE_DELAY`, `OTEL_BSP_EXPORT_TIMEOUT`, `OTEL_BSP_MAX_QUEUE_SIZE`, `OTEL_BSP_MAX_EXPORT_BATCH_SIZE`
- `OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT`, `OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT`, `OTEL_SPAN_EVENT_COUNT_LIMIT`, `OTEL_SPAN_LINK_COUNT_LIMIT`, `OTEL_SPAN_ATTRIBUTE_PER_EVENT_COUNT_LIMIT`, `OTEL_SPAN_ATTRIBUTE_PER_LINK_COUNT_LIMIT`
- `OTEL_LOGRECORD_ATTRIBUTE_VALUE_LENGTH_LIMIT`, `OTEL_LOGRECORD_ATTRIBUTE_COUNT_LIMIT`
- `OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT`, `OTEL_ATTRIBUTE_COUNT_LIMIT`, used as the fallback for the span and log record limits

`spanLimits` in `registerOTel` still overrides the env values, field by field. A value that is not a finite non-negative integer is ignored.

What changed:

- These variables now also apply in the Edge runtime. They had no effect there before.
- They do not apply to a `BatchSpanProcessor` you construct yourself. Pass the options to its constructor.
- `OTEL_BLRP_*` is not read. Configure your `BatchLogRecordProcessor` directly.

### Behavior changes

- Exported spans and span links now carry the OTLP `flags` field (sampled and remote-parent bits) in both `http/protobuf` and `http/json`. Older collectors ignore it.
- JSON from the OTLP JSON exporter and from `reportSpans` uses hex ids and decimal-nanosecond timestamp strings. Compared with `@opentelemetry/otlp-transformer` 0.205.0 on the same span, the only new span field in 0.300.0 JSON is `flags`. The timestamp string form is already what 0.205.0 JSON emits.
- `OTLPHttpProtoTraceExporter` now uses the upstream `ProtobufTraceSerializer`. The encoding is otherwise unchanged apart from `flags`.
- If spans fail to serialize, the OTLP exporters now report a failed export. Before, they dropped the batch silently.
- The bundled package no longer includes `protobufjs`. This build is 117,851 bytes for `dist/node/index.js` and 118,786 bytes for `dist/edge/index.js`.
