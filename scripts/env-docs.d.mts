export const README: string;
export const SCHEMA: string;
export const ENV_EXAMPLE: string;
export const START: string;
export const END: string;
export function parseEnvExample(text: string): Record<string, { value: string; comment: string }>;
export function parseSchema(
  source: string,
): Array<{ key: string; type: string; default: string; required: boolean; doc: string }>;
export function renderEnvDocs(schemaSource: string, envExampleText: string): string;
export function spliceReadme(readme: string, block: string): string;
