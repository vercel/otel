/**
 * TODO: Placeholder for the `@vercel/request-context-storage` package.
 * Replace with the real package once it's published.
 */

export interface VercelRequestContext {
  waitUntil: (
    promiseOrFunc: Promise<unknown> | (() => Promise<unknown>),
  ) => void;
  headers: Record<string, string | undefined>;
  url: string;
  [key: symbol]: unknown;
}

interface Reader {
  get: () => VercelRequestContext | undefined;
}

const symbol = Symbol.for("@vercel/request-context");

interface GlobalWithReader {
  [symbol]?: Reader;
}

export function getVercelRequestContext(): VercelRequestContext | undefined {
  const reader = (globalThis as GlobalWithReader)[symbol];
  return reader?.get();
}

let testContext: VercelRequestContext | undefined;

export function withRequestContext<T>(
  context: VercelRequestContext,
  fn: () => T,
): T {
  let reader = (globalThis as GlobalWithReader)[symbol];
  if (!reader) {
    reader = {
      get: () => testContext,
    };
    (globalThis as GlobalWithReader)[symbol] = reader;
  }
  testContext = context;
  return fn();
}
