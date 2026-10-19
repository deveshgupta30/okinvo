export function mergeInto(
  target: Record<string, unknown>,
  fragment: Record<string, unknown>,
  prefix?: string,
  conflicts?: string[],
): string[];
