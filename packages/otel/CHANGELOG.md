# @vercel/otel

## 1.2.1

### Patch Changes

- 79fbec0: Eliminate race condition between response end and trace end
- 31ce66b: More docs on fetch instrumentation

## 1.2.0

### Minor Changes

- 7a04c92: Avoid OTLP longbits to avoid compatibility problems with some OTLP collectors

## 1.1.0

### Minor Changes

- 83ad945: Ensure that fetch receives the original input

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
