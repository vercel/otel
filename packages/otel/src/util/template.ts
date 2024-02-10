import type { Attributes } from "@opentelemetry/api";

export function resolveTemplate(template: string, attrs: Attributes): string {
  return template.replace(/\{(?<temp1>[^{}]+)\}/g, (match, key) => {
    const value = attrs[key as string];
    if (value !== undefined) {
      return String(value);
    }
    return match;
  });
}
