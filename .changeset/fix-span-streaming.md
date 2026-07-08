---
"@vercel/otel": patch
---

Fix long-running invocations (e.g. Vercel Workflows) losing most spans from the first part of the run. The exporter now enforces strict per-trace `reportSpans` payloads: spans are grouped by their own trace id, buffered per trace, and shipped in one payload at the trace's final flush through the request context captured for that trace at root-span start. Untracked traces keep shipping immediately through the ambient context, unattributable spans are retained and retried instead of silently dropped, and the processor drains the BatchSpanProcessor queue in-context on span end so long runs cannot overflow its maxQueueSize. An opt-in streaming mode (`VERCEL_OTEL_STREAM_SPANS=1`) ships every trace's spans on every flush instead.
