---
"otelzero": major
"@vercel/otel": major
---

Add support for OTel JS SDK 2.X

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
  serviceName: 'your-service-name',
  logRecordProcessor: myProcessor // Single processor
});

// After (v2.x)
registerOTel({
  serviceName: 'your-service-name',
  logRecordProcessors: [myProcessor] // Array of processors
});
```

**Metric Readers:**

```typescript
// Before (v1.x)
registerOTel({
  serviceName: 'your-service-name',
  metricReader: myReader // Single reader
});

// After (v2.x)
registerOTel({
  serviceName: 'your-service-name',
  metricReaders: [myReader] // Array of readers
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
     logRecordProcessors: [myProcessor];
   });
   ```

   **Metric Readers** - Change `metricReader` to `metricReaders`:

   ```typescript
   // Before
   registerOTel({
     serviceName: 'your-service-name',
     metricReader: myReader
   });

   // After
   registerOtel({
     serviceName: 'your-service-name',
     metricReaders: [myReader];
   });
   ```

3. **No code changes needed** for basic usage - the SDK interface remains the same for most common use cases.

For complete details on migrating from OpenTelemetry JS SDK 1.x to 2.x, see the [official OpenTelemetry migration guide](https://github.com/open-telemetry/opentelemetry-js/blob/v2.0.0/doc/upgrade-to-2.x.md).