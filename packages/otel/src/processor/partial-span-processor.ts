import {
  context,
  diag,
  type Context,
  type HrTime,
  type Link,
} from "@opentelemetry/api";
import {
  ExportResultCode,
  getNumberFromEnv,
  globalErrorHandler,
  suppressTracing,
  unrefTimer,
} from "@opentelemetry/core";
import type {
  BufferConfig,
  ReadableSpan,
  Span,
  SpanExporter,
  SpanProcessor,
  TimedEvent,
} from "@opentelemetry/sdk-trace-base";
import { isSampled } from "../util/sampled";

/** @internal */
export class PartialSpanProcessor implements SpanProcessor {
  private readonly maxExportBatchSize: number;
  private readonly maxQueueSize: number;
  private readonly scheduledDelayMillis: number;
  private readonly exportTimeoutMillis: number;
  private queue: QueuedSpan[] = [];
  private timer: NodeJS.Timeout | undefined;
  private flushPromise = Promise.resolve();
  private shutdownStarted = false;
  private shutdownPromise: Promise<void> | undefined;
  private droppedSpansCount = 0;

  constructor(
    private readonly exporter: SpanExporter,
    config?: BufferConfig,
  ) {
    this.maxExportBatchSize =
      typeof config?.maxExportBatchSize === "number"
        ? config.maxExportBatchSize
        : (getNumberFromEnv("OTEL_BSP_MAX_EXPORT_BATCH_SIZE") ?? 512);
    this.maxQueueSize =
      typeof config?.maxQueueSize === "number"
        ? config.maxQueueSize
        : (getNumberFromEnv("OTEL_BSP_MAX_QUEUE_SIZE") ?? 2048);
    this.scheduledDelayMillis =
      typeof config?.scheduledDelayMillis === "number"
        ? config.scheduledDelayMillis
        : (getNumberFromEnv("OTEL_BSP_SCHEDULE_DELAY") ?? 5000);
    this.exportTimeoutMillis =
      typeof config?.exportTimeoutMillis === "number"
        ? config.exportTimeoutMillis
        : (getNumberFromEnv("OTEL_BSP_EXPORT_TIMEOUT") ?? 30000);

    if (this.maxExportBatchSize > this.maxQueueSize) {
      diag.warn(
        "PartialSpanProcessor: maxExportBatchSize must be smaller or equal to maxQueueSize, setting maxExportBatchSize to match maxQueueSize",
      );
      this.maxExportBatchSize = this.maxQueueSize;
    }
  }

  forceFlush(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }
    return this.flushAll().then(() => this.exporter.forceFlush?.());
  }

  onStart(span: Span, _parentContext: Context): void {
    if (this.shutdownStarted || !isSampled(span.spanContext().traceFlags)) {
      return;
    }
    this.addToBuffer(span, true);
  }

  onEnd(span: ReadableSpan): void {
    if (this.shutdownStarted || !isSampled(span.spanContext().traceFlags)) {
      return;
    }
    this.removePendingPartial(span);
    this.addToBuffer(span, false);
  }

  shutdown(): Promise<void> {
    if (!this.shutdownPromise) {
      this.shutdownStarted = true;
      this.shutdownPromise = this.flushAll().then(() => this.exporter.shutdown());
    }
    return this.shutdownPromise;
  }

  private addToBuffer(span: ReadableSpan, partial: boolean): void {
    if (this.queue.length >= this.maxQueueSize) {
      if (this.droppedSpansCount === 0) {
        diag.debug("maxQueueSize reached, dropping spans");
      }
      this.droppedSpansCount++;
      return;
    }

    if (this.droppedSpansCount > 0) {
      diag.warn(
        `Dropped ${this.droppedSpansCount} spans because maxQueueSize reached`,
      );
      this.droppedSpansCount = 0;
    }

    this.queue.push({
      span,
      partial,
      key: spanKey(span),
    });
    if (this.queue.length >= this.maxExportBatchSize) {
      void this.flushAll().catch(globalErrorHandler);
      return;
    }
    this.maybeStartTimer();
  }

  private flushAll(): Promise<void> {
    this.clearTimer();
    const flush = (): Promise<void> => {
      const flushNextBatch = (): Promise<void> => {
        if (this.queue.length === 0) {
          return Promise.resolve();
        }
        return this.flushOneBatch().then(flushNextBatch);
      };
      return flushNextBatch();
    };
    this.flushPromise = this.flushPromise.then(flush, flush);
    return this.flushPromise;
  }

  private async flushOneBatch(): Promise<void> {
    const entries = this.queue.splice(0, this.maxExportBatchSize);
    if (entries.length === 0) {
      return;
    }
    const spans = entries.map(({ span }) => snapshotSpan(span));

    await context.with(suppressTracing(context.active()), async () => {
      const pendingResources: Promise<void>[] = [];
      for (const span of spans) {
        if (
          span.resource.asyncAttributesPending &&
          span.resource.waitForAsyncAttributes
        ) {
          pendingResources.push(span.resource.waitForAsyncAttributes());
        }
      }
      await Promise.all(pendingResources);
      await this.exportSpans(spans);
    });
  }

  private exportSpans(spans: ReadableSpan[]): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        reject(new Error("Timeout"));
      }, this.exportTimeoutMillis);

      const finish = (callback: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        callback();
      };

      try {
        this.exporter.export(spans, (result) => {
          finish(() => {
            if (result.code === ExportResultCode.SUCCESS) {
              resolve();
            } else {
              reject(
                result.error ??
                  new Error("PartialSpanProcessor: span export failed"),
              );
            }
          });
        });
      } catch (error) {
        finish(() => {
          reject(error instanceof Error ? error : new Error(String(error)));
        });
      }
    });
  }

  private maybeStartTimer(): void {
    if (this.timer !== undefined) {
      return;
    }
    this.timer = setTimeout(() => {
      void this.flushAll().catch(globalErrorHandler);
    }, this.scheduledDelayMillis);
    unrefTimer(this.timer);
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private removePendingPartial(span: ReadableSpan): void {
    const key = spanKey(span);
    this.queue = this.queue.filter(
      (entry) => !entry.partial || entry.key !== key,
    );
  }
}

function spanKey(span: ReadableSpan): string {
  const { traceId, spanId } = span.spanContext();
  return `${traceId}:${spanId}`;
}

interface QueuedSpan {
  span: ReadableSpan;
  partial: boolean;
  key: string;
}

function snapshotSpan(span: ReadableSpan): ReadableSpan {
  const spanContext = { ...span.spanContext() };
  const parentSpanContext = span.parentSpanContext
    ? { ...span.parentSpanContext }
    : undefined;
  const ended = span.ended;

  return {
    name: span.name,
    kind: span.kind,
    spanContext: () => spanContext,
    parentSpanContext,
    startTime: copyHrTime(span.startTime),
    endTime: ended ? copyHrTime(span.endTime) : [0, 0],
    status: { ...span.status },
    attributes: { ...span.attributes },
    links: span.links.map(copyLink),
    events: span.events.map(copyEvent),
    duration: ended ? copyHrTime(span.duration) : [0, 0],
    ended,
    resource: span.resource,
    instrumentationScope: span.instrumentationScope,
    droppedAttributesCount: span.droppedAttributesCount,
    droppedEventsCount: span.droppedEventsCount,
    droppedLinksCount: span.droppedLinksCount,
  };
}

function copyHrTime(time: HrTime): HrTime {
  return [time[0], time[1]];
}

function copyEvent(event: TimedEvent): TimedEvent {
  return {
    ...event,
    time: copyHrTime(event.time),
    attributes: event.attributes ? { ...event.attributes } : undefined,
  };
}

function copyLink(link: Link): Link {
  return {
    ...link,
    context: { ...link.context },
    attributes: link.attributes ? { ...link.attributes } : undefined,
  };
}
