/** Equivalent to TextMapGetter from `@opentelemetry/api`. */
export interface CarrierGetter<Carrier> {
  keys: (carrier: Carrier) => string[];
  get: (carrier: Carrier, key: string) => undefined | string | string[];
}

/** Equivalent to TextMapSetter from `@opentelemetry/api`. */
export interface CarrierSetter<Carrier> {
  set: (carrier: Carrier, key: string, value: string) => void;
}
