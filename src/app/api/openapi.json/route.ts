import { buildOpenApi } from "@/lib/api/openapi";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** The OpenAPI document of this instance (spec §7.3); public, like any API description. */
export async function GET(): Promise<Response> {
  return Response.json(buildOpenApi(env.APP_URL), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
