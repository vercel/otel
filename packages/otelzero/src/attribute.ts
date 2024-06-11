/** Equivalent to Attributes from `@opentelemetry/api`. */
export type Attributes = Record<string, AttributeValue | undefined>;

/** Equivalent to AttributeValue from `@opentelemetry/api`. */
export type AttributeValue =
  | string
  | number
  | boolean
  | (null | undefined | string)[]
  | (null | undefined | number)[]
  | (null | undefined | boolean)[];
