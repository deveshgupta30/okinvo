export function flatten(
  obj: object,
  prefix?: string,
  out?: Map<string, unknown>,
): Map<string, unknown>;
export function placeholders(message: unknown): string;
export function usedKeys(source: string, file: string): Array<[string, string]>;
