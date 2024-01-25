/** @internal */
export function parseRequestId(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }
  const parts = header.split("::");
  return parts.at(-1);
}
