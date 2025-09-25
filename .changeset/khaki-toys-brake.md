---
"otelzero": major
"@vercel/otel": major
---

Add support for OTel JS SDK 2.X

## Breaking Changes

### 1. OpenTelemetry SDK dependencies updated to v2.x

The following peer dependencies have been updated to support OpenTelemetry JS SDK 2.x:

- `@opentelemetry/api`: `>=1.9.0 <3.0.0` (was `>=1.7.0 <2.0.0`)
- `@opentelemetry/api-logs`: `>=0.200.0 <0.300.0` (was `>=0.46.0 <0.200.0`)
- `@opentelemetry/instrumentation`: `>=0.200.0 <0.300.0` (was `>=0.46.0 <0.200.0`)
- `@opentelemetry/resources`: `>=2.0.0 <3.0.0` (was `>=1.19.0 <2.0.0`)
- `@opentelemetry/sdk-logs`: `>=0.200.0 <0.300.0` (was `>=0.46.0 <0.200.0`)
- `@opentelemetry/sdk-metrics`: `>=2.0.0 <3.0.0` (was `>=1.19.0 <2.0.0`)
- `@opentelemetry/sdk-trace-base`: `>=2.0.0 <3.0.0` (was `>=1.19.0 <2.0.0`)

### 2. Log Record Processors configuration change

**Before (v1.x):**
```typescript
registerOTel({
   serviceName: 'your-service-name'
   logRecordProcessor: myProcessor // Single processor
});
```

**After (v2.x):**
```typescript
registerOTel({
   serviceName: 'your-service-name'
   logRecordProcessors: [myProcessor] // Array of processors
});
```

## Migration Guide

1. **Update peer dependencies**: Upgrade all stable OpenTelemetry packages to v2.x & experimental OpenTelemetry packages to v0.2XX in your package.json:
   ```bash
   npm install @opentelemetry/api@^1.9.0 @opentelemetry/resources@^2.1.0 @opentelemetry/sdk-trace-base@^2.1.0 @opentelemetry/sdk-metrics@^2.1.0 @opentelemetry/sdk-logs@^0.205.0 @opentelemetry/instrumentation@^0.205.0
   ```

2. **Update log processors configuration**: Change `logRecordProcessor` to `logRecordProcessors` and wrap single processors in an array:
   ```typescript
   // Before
   { logRecordProcessor: myProcessor }

   // After
   { logRecordProcessors: [myProcessor] }
   ```

3. **No code changes needed** for basic usage - the SDK interface remains the same for most common use cases.
