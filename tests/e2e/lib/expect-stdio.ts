import { expect } from "vitest";

export async function expectStdio(
  stdio: string[],
  match: string | RegExp | ((s: string) => boolean)
): Promise<void> {
  const found = await Promise.race([
    new Promise<boolean>((resolve) => {
      const interval = setInterval(() => {
        const matched = stdio.some((s) => {
          if (typeof match === "string") {
            return s.includes(match);
          } else if (match instanceof RegExp) {
            return match.test(s);
          }
          return match(s);
        });
        if (matched) {
          clearInterval(interval);
          resolve(true);
        }
      }, 50);
    }),
    new Promise<undefined>((resolve) => {
      setTimeout(() => resolve(undefined), 5000);
    }),
  ]);
  expect(found, `Value not found in stdio: "${String(match)}"`).toBe(true);
}
