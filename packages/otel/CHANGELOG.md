# @vercel/otel

## 2.0.0

### Major Changes

- [#165](https://github.com/vercel/otel/pull/165) [`7887411`](https://github.com/vercel/otel/commit/788741179c9a96269d59a12acb3d10fc70ff8262) Thanks [@bengigone](https://github.com/bengigone)! - Add support for OTel JS SDK 2.X

  ## Breaking Changes

  ### 1. OpenTelemetry SDK dependencies updated

  **API package** (minimum version bumped):

  - `@opentelemetry/api`: `>=1.9.0 <3.0.0` (was `>=1.7.0 <2.0.0`)

  **Stable packages** (updated to v2.x):

  - `@opentelemetry/resources`: `>=2.0.0 <3.0.0` (was `>=1.19.0 <2.0.0`)
  - `@opentelemetry/sdk-metrics`: `>=2.0.0 <3.0.0` (was `>=1.19.0 <2.0.0`)
  - `@opentelemetry/sdk-trace-base`: `>=2.0.0 <3.0.0` (was `>=1.19.0 <2.0.0`)

  **Experimental packages** (updated to v0.2XX):

  - `@opentelemetry/api-logs`: `>=0.200.0 <0.300.0` (was `>=0.46.0 <0.200.0`)
  - `@opentelemetry/instrumentation`: `>=0.200.0 <0.300.0` (was `>=0.46.0 <0.200.0`)
  - `@opentelemetry/sdk-logs`: `>=0.200.0 <0.300.0` (was `>=0.46.0 <0.200.0`)

  ### 2. Minimum Node.js version requirement

  The minimum supported Node.js has been raised to `^18.19.0 || >=20.6.0` to align with OpenTelemetry JS SDK 2.x requirements. This means that support for Node.js 14 and 16 has been dropped.

  ### 3. Configuration changes

  **Log Record Processors:**

  ```typescript
  // Before (v1.x)
  registerOTel({
    serviceName: "your-service-name",
    logRecordProcessor: myProcessor, // Single processor
  });

  // After (v2.x)
  registerOTel({
    serviceName: "your-service-name",
    logRecordProcessors: [myProcessor], // Array of processors
  });
  ```

  **Metric Readers:**

  ```typescript
  // Before (v1.x)
  registerOTel({
    serviceName: "your-service-name",
    metricReader: myReader, // Single reader
  });

  // After (v2.x)
  registerOTel({
    serviceName: "your-service-name",
    metricReaders: [myReader], // Array of readers
  });
  ```

  ## Migration Guide

  1. **Update OpenTelemetry dependencies**: Update the OpenTelemetry packages you are using in your project to the compatible versions:

     **API package** (minimum version bumped):

     ```bash
     npm install @opentelemetry/api@^1.9.0
     ```

     **Stable packages** (upgrade to v2.x):

     ```bash
     npm install @opentelemetry/resources@^2.1.0 @opentelemetry/sdk-trace-base@^2.1.0 @opentelemetry/sdk-metrics@^2.1.0
     ```

     **Experimental packages** (upgrade to v0.2XX):

     ```bash
     npm install @opentelemetry/sdk-logs@^0.205.0 @opentelemetry/instrumentation@^0.205.0 @opentelemetry/api-logs@^0.205.0
     ```

     **Note**: Only install the packages you are actually using in your project.

  2. **Update configuration**:

     **Log Record Processors** - Change `logRecordProcessor` to `logRecordProcessors`:

     ```typescript
     // Before
     registerOTel({
       serviceName: 'your-service-name',
       logRecordProcessor: myProcessor // Single processor
     });

     // After
     registerOTel({
       serviceName: 'your-service-name',
       logRecordProcessors: [myProcessor], // Array of processors
     });
     ```

     **Metric Readers** - Change `metricReader` to `metricReaders`:

     ```typescript
     // Before
     registerOTel({
       serviceName: 'your-service-name',
       metricReader: myReader, // Single processor
     });

     // After
     registerOtel({
       serviceName: 'your-service-name',
       metricReaders: [myReader], // Array of processors
     });
     ```

  3. **No code changes needed** for basic usage - the SDK interface remains the same for most common use cases.

  For complete details on migrating from OpenTelemetry JS SDK 1.x to 2.x, see the [official OpenTelemetry migration guide](https://github.com/open-telemetry/opentelemetry-js/blob/v2.0.0/doc/upgrade-to-2.x.md).

## 1.13.0

### Minor Changes

- a724e57: add support for auto HTTP instrumentation
- d04fbdd: Expand a set of OTEL versions for peer dependencies

## 1.12.0

### Minor Changes

- 26167e7: Fixes an issue where VERCEL_OTEL_ENDPOINTS is not set

## 1.11.0

### Minor Changes

- bc25833: Releases the `vercel-runtime` trace propagator and span processor

## 1.10.4

### Patch Changes

- 4488770: Fixes the experiment-vercel-trace propagator registration

## 1.10.3

### Patch Changes

- 78b9c47: Removes the experimental configuration. Adds new `experimental-vercel-trace` spanProcessor

## 1.10.2

### Patch Changes

- fc87b45: An experimental option for trace export via Vercel Runtime

## 1.10.1

### Patch Changes

- 2f43edb: Use VERCEL_REGION system env var instead of reading internal header
- 4019976: Fix FormData in fetch instrumentation

## 1.10.0

### Minor Changes

- 4882239: Set vercel.deployment_id as a resource attribute

## 1.9.2

### Patch Changes

- 81abfa4: Set default otel service version to VERCEL_DEPLOYMENT_ID

## 1.9.1

### Patch Changes

- 8b741d4: Edge-comaptible W3CTraceContextPropagator

## 1.9.0

### Minor Changes

- c7b72a9: OTEL logs and instrumentation deps restricted to be in the range of [0.46.0, 1.0.0)

## 1.8.4

### Patch Changes

- 560faed: Fix typo on key 'resource.name' when resolving Resource attributes

## 1.8.3

### Patch Changes

- 2e78b07: Enable sourcemaps

## 1.8.2

### Patch Changes

- 6cf1e79: Manual protobuf encoding for OTLP to save about 180K binary size

## 1.8.1

### Patch Changes

- 5019762: (fix) Use the fetch's span context for propagation, not parent's.

## 1.8.0

### Minor Changes

- 75d26f5: Fetch: map request/response headers to attributes
- 056ea14: Configuration to customize root span attributes based on the request headers

## 1.7.2

### Patch Changes

- 9ba9131: Strip eval() calls on Edge

## 1.7.1

### Patch Changes

- 9354de3: Release 1.7x

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
