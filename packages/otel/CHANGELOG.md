# @vercel/otel

## 1.0.1

### Patch Changes

- a9d3a36: Remove "experimental" warning

## 1.0.0

### Major Changes

- 2daf631: - Support for Node and Edge environments
  - Telemetry context propagation, including [W3C Trace Context](https://www.w3.org/TR/trace-context/)
  - Fetch API instrumentation with context propagation.
  - Support and auto-configuration for [Vercel OTEL collector](https://vercel.com/docs/observability/otel-overview/quickstart).
  - Enhanced metadata reporting.
  - Sampling support.
  - Custom tracing exporter support.
  - Batched trace exporting.
