# @vercel/otel

## 1.7.0

### Minor Changes

- bb8f059: Set the default 'operation.name' attribute for web requests to 'web.request'.

  Update the default 'resource.name' attribute for web requests to the concatenation of the HTTP method and the HTTP route.

### Patch Changes

- 460586e: Update documentation

## 1.6.2

### Patch Changes

- 4c86b92: Fix request clonning bug in Edge runtime

## 1.6.1

### Patch Changes

- b9be833: Resource name adjustments
- 5b8c36f: Fix types for OTLPHttpJsonTraceExporter and OTLPHttpProtoTraceExporter
- b9be833: Reorder dangling spans to end before the parent span

## 1.6.0

### Minor Changes

- 0cc92da: Use @opentelemetry/sdk-trace-base as a peer dependency

## 1.5.0

### Minor Changes

- 1a25890: Fetch span covers the complete response, including streaming

## 1.4.0

### Minor Changes

- 913fcb7: RequestInit.opentelemetry property to override fetch instrumentation

### Patch Changes

- c311f29: Include API docs

## 1.3.0

### Minor Changes

- 79110fc: resource.name and resourceNameTemplate for fetch instrumentation
- 965fce6: DataDog resource/operation mapping

### Patch Changes

- 67b5337: Edge performance.timeOrigin is set as 0
- bc65efe: Automatically propagate context to localhost on dev, and same branch_host on preview/prod
- bc65efe: Added vercel.branch_host resource attribute

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
  - Support and auto-configuration for [Vercel OTEL collector](https://vercel.com/docs/observability/otel-overview).
  - Enhanced metadata reporting.
  - Sampling support.
  - Custom tracing exporter support.
  - Batched trace exporting.
