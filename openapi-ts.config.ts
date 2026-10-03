import { defineConfig } from "@hey-api/openapi-ts";

/** `pnpm sdk:generate`: the TypeScript SDK under sdk/src from the committed OpenAPI document. */
export default defineConfig({
  input: "./openapi/okinvo.json",
  output: "./sdk/src",
  plugins: ["@hey-api/client-fetch", "@hey-api/typescript", "@hey-api/sdk"],
});
