import type { AttributeValue, Attributes } from "./attribute";
import type { Exception } from "./exception";
import type { TimeInput } from "./time";

/** Equivalent to Span from `@opentelemetry/api`. */
export interface Span {
  spanContext: () => SpanContext;
  updateName: (name: string) => this;
  setAttribute: (key: string, value: AttributeValue) => this;
  setAttributes: (attributes: Attributes) => this;
  addEvent: (
    name: string,
    attributesOrStartTime?: Attributes | TimeInput,
    startTime?: TimeInput,
  ) => this;
  addLink: (link: Link) => this;
  addLinks: (links: Link[]) => this;
  setStatus: (status: SpanStatus) => this;
  end: (endTime?: TimeInput) => void;
  isRecording: () => boolean;
  recordException: (exception: Exception, time?: TimeInput) => void;
}

/** Equivalent to SpanKind from `@opentelemetry/api`. */
export enum SpanKind {
  INTERNAL = 0,
  SERVER = 1,
  CLIENT = 2,
  PRODUCER = 3,
  CONSUMER = 4,
}

/**
 * Equivalent to SpanContext from `@opentelemetry/api`.
 *
 * `traceState` field is excluded since it's not usually used in API use cases.
 */
export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  isRemote?: boolean;
}

/** Equivalent to SpanStatus from `@opentelemetry/api`. */
export interface SpanStatus {
  code: SpanStatusCode;
  message?: string;
}

/** Equivalent to SpanStatusCode from `@opentelemetry/api`. */
export enum SpanStatusCode {
  UNSET = 0,
  OK = 1,
  ERROR = 2,
}

/** Equivalent to Link from `@opentelemetry/api`. */
export interface Link {
  context: SpanContext;
  attributes?: Attributes;
}

export interface SpanOptions {
  kind?: SpanKind;
  startTime?: TimeInput;
  attributes?: Attributes;
  links?: Link[];
  library?:
    | string
    | {
        name: string;
        version: string;
      };
}
