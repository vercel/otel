import {
  baggageEntryMetadataFromString,
  propagation,
} from "@opentelemetry/api";
import type {
  BaggageEntry,
  BaggageEntryMetadata,
  Context,
  TextMapGetter,
} from "@opentelemetry/api";
import { W3CBaggagePropagator as CoreW3CBaggagePropagator } from "@opentelemetry/core";

const BAGGAGE_HEADER = "baggage";
const BAGGAGE_ITEMS_SEPARATOR = ",";
const BAGGAGE_PROPERTIES_SEPARATOR = ";";
const BAGGAGE_KEY_PAIR_SEPARATOR = "=";
const BAGGAGE_MAX_NAME_VALUE_PAIRS = 180;
const BAGGAGE_MAX_PER_NAME_VALUE_PAIRS = 4096;
const BAGGAGE_MAX_TOTAL_LENGTH = 8192;

interface ParseState {
  count: number;
  totalSize: number;
}

/**
 * Same as the `W3CBaggagePropagator` from `@opentelemetry/core`, but `extract`
 * enforces the W3C Baggage limits on inbound headers (GHSA-8988-4f7v-96qf).
 * Ported from `@opentelemetry/core` 2.8.0. Remove once the bundled
 * `@opentelemetry/core` is 2.8.0 or later.
 */
export class W3CBaggagePropagator extends CoreW3CBaggagePropagator {
  override extract(
    context: Context,
    carrier: unknown,
    getter: TextMapGetter,
  ): Context {
    const headerValue = getter.get(carrier, BAGGAGE_HEADER);
    if (!headerValue) {
      return context;
    }

    const baggage: Record<string, BaggageEntry> = {};
    const state: ParseState = { count: 0, totalSize: 0 };
    const headerValues = Array.isArray(headerValue)
      ? headerValue
      : [headerValue];
    for (const value of headerValues) {
      parseBaggageHeaderString(value, baggage, state);
    }

    if (state.count === 0) {
      return context;
    }
    return propagation.setBaggage(context, propagation.createBaggage(baggage));
  }
}

function parseBaggageHeaderString(
  value: string,
  baggage: Record<string, BaggageEntry>,
  state: ParseState,
): void {
  let start = 0;
  while (start < value.length && state.count < BAGGAGE_MAX_NAME_VALUE_PAIRS) {
    const end = value.indexOf(BAGGAGE_ITEMS_SEPARATOR, start);
    const entryEnd = end === -1 ? value.length : end;
    const entryLength = entryEnd - start;
    if (entryLength <= BAGGAGE_MAX_PER_NAME_VALUE_PAIRS) {
      const keyPair = parsePairKeyValue(value.substring(start, entryEnd));
      if (keyPair) {
        // The comma separator counts toward the total for every accepted entry after the first.
        const entrySize = (state.count === 0 ? 0 : 1) + entryLength;
        if (state.totalSize + entrySize > BAGGAGE_MAX_TOTAL_LENGTH) {
          return;
        }
        baggage[keyPair.key] = keyPair.metadata
          ? { value: keyPair.value, metadata: keyPair.metadata }
          : { value: keyPair.value };
        state.count++;
        state.totalSize += entrySize;
      }
    }
    if (end === -1) {
      return;
    }
    start = end + 1;
  }
}

function parsePairKeyValue(
  entry: string,
):
  | { key: string; value: string; metadata: BaggageEntryMetadata | undefined }
  | undefined {
  if (!entry) {
    return undefined;
  }
  const metadataSeparatorIndex = entry.indexOf(BAGGAGE_PROPERTIES_SEPARATOR);
  const keyPairPart =
    metadataSeparatorIndex === -1
      ? entry
      : entry.substring(0, metadataSeparatorIndex);
  const separatorIndex = keyPairPart.indexOf(BAGGAGE_KEY_PAIR_SEPARATOR);
  if (separatorIndex <= 0) {
    return undefined;
  }
  const rawKey = keyPairPart.substring(0, separatorIndex).trim();
  const rawValue = keyPairPart.substring(separatorIndex + 1).trim();
  if (!rawKey || !rawValue) {
    return undefined;
  }

  let key: string;
  let value: string;
  try {
    key = decodeURIComponent(rawKey);
    value = decodeURIComponent(rawValue);
  } catch {
    return undefined;
  }

  let metadata: BaggageEntryMetadata | undefined;
  if (
    metadataSeparatorIndex !== -1 &&
    metadataSeparatorIndex < entry.length - 1
  ) {
    metadata = baggageEntryMetadataFromString(
      entry.substring(metadataSeparatorIndex + 1),
    );
  }
  return { key, value, metadata };
}
