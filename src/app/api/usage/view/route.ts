import { env } from "@/lib/env";
import { todayIn } from "@/lib/dates";
import { parseObject } from "@/lib/forms";
import { PageViewBodySchema } from "@/lib/schemas/page-view";
import { isActor, requireActorApi } from "@/server/auth";
import { recordPageView } from "@/server/dal/usage";

export const runtime = "nodejs";

/**
 * The page-view beacon (addendum §2 item 19): the shell posts each client-side navigation here,
 * because a shared layout renders once per hard load and would miss every soft navigation. Only
 * the screen and the UTC day are stored; a signed-in session is required so strangers cannot
 * write rows. Answers 204 whether or not counting is on.
 */
export async function POST(request: Request): Promise<Response> {
  const actor = await requireActorApi("VIEWER");
  if (!isActor(actor)) return actor;
  if (!env.ANALYTICS_LOCAL) return new Response(null, { status: 204 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = parseObject(PageViewBodySchema, body);
  if (!parsed.ok) return Response.json({ error: "bad_request" }, { status: 400 });
  await recordPageView(parsed.data.path, todayIn("UTC")).catch(() => {});
  return new Response(null, { status: 204 });
}
