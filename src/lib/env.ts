import "server-only";
import { serverSchema, type ServerEnv } from "./env.schema";

function load(): ServerEnv {
  const result = serverSchema.safeParse(process.env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join("\n")}`);
  }
  return result.data;
}

export const env: ServerEnv = load();
