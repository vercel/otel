# OTEL Zero (Experimental)

The `@opentelemetry/api` has a few drawbacks:

1. It's large and doesn't tree-shake well.
2. The APIs are inconvenient for simple cases and often require wrapping.

This experimental library tries to address both of these issues:

1. The complete (prior to tree-shaking) size is 2.8K
2. `trace`, `wrapTrace`, and `meter` provide simple API shapes for common use cases.
