---
"otelzero": major
"@vercel/otel": major
---

Add support for OTel JS SDK 2.X

## Breaking Changes

### 1. OpenTelemetry SDK dependencies updated

**Stable packages** (updated to v2.x):
- `@opentelemetry/api`: `>=1.9.0 <3.0.0` (was `>=1.7.0 <2.0.0`)
- `@opentelemetry/resources`: `>=2.0.0 <3.0.0` (was `>=1.19.0 <2.0.0`)
- `@opentelemetry/sdk-metrics`: `>=2.0.0 <3.0.0` (was `>=1.19.0 <2.0.0`)
- `@opentelemetry/sdk-trace-base`: `>=2.0.0 <3.0.0` (was `>=1.19.0 <2.0.0`)

**Experimental packages** (updated to v0.2XX):
- `@opentelemetry/api-logs`: `>=0.200.0 <0.300.0` (was `>=0.46.0 <0.200.0`)
- `@opentelemetry/instrumentation`: `>=0.200.0 <0.300.0` (was `>=0.46.0 <0.200.0`)
- `@opentelemetry/sdk-logs`: `>=0.200.0 <0.300.0` (was `>=0.46.0 <0.200.0`)

### 2. Configuration changes from single to array

**Log Record Processors:**
```typescript
// Before (v1.x)
registerOTel({
   serviceName: 'your-service-name'
   logRecordProcessor: myProcessor // Single processor
});

// After (v2.x)
registerOTel({
   serviceName: 'your-service-name'
   logRecordProcessors: [myProcessor] // Array of processors
});
```

**Metric Readers:**
```typescript
// Before (v1.x)
registerOTel({
   serviceName: 'your-service-name'
   metricReader: myReader // Single reader
});

// After (v2.x)
registerOTel({
   serviceName: 'your-service-name'
   metricReaders: [myReader] // Array of readers
});
```

## Migration Guide

For complete details on migrating from OpenTelemetry JS SDK 1.x to 2.x, see the [official OpenTelemetry migration guide](https://github.com/open-telemetry/opentelemetry-js/blob/v2.0.0/doc/upgrade-to-2.x.md).

### @vercel/otel specific changes:

1. **Update peer dependencies**:

   **Stable packages** (upgrade to v2.x):
   ```bash
   npm install @opentelemetry/api@^1.9.0 @opentelemetry/resources@^2.1.0 @opentelemetry/sdk-trace-base@^2.1.0 @opentelemetry/sdk-metrics@^2.1.0
   ```

   **Experimental packages** (upgrade to v0.2XX):
   ```bash
   npm install @opentelemetry/sdk-logs@^0.205.0 @opentelemetry/instrumentation@^0.205.0 @opentelemetry/api-logs@^0.205.0
   ```

2. **Update log processors configuration**: Change `logRecordProcessor` to `logRecordProcessors` and wrap single processors in an array:
   ```typescript
   // Before
   { logRecordProcessor: myProcessor }

   // After
   { logRecordProcessors: [myProcessor] }
   ```

3. **No code changes needed** for basic usage - the SDK interface remains the same for most common use cases.