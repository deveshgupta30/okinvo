import { documentMessages } from "@/lib/i18n/document-messages";
import { isActor, requireActorApi } from "@/server/auth";

export const dynamic = "force-dynamic";

/**
 * The fixed document strings of a language (SPEC §4.10) for the builder's live preview; an
 * unknown tag answers with en-US, exactly as a render would.
 */
export async function GET(request: Request): Promise<Response> {
  const actor = await requireActorApi("VIEWER");
  if (!isActor(actor)) return actor;
  const locale = new URL(request.url).searchParams.get("locale") ?? "en-US";
  return Response.json(await documentMessages(locale.slice(0, 35)), {
    headers: { "Cache-Control": "private, max-age=3600" },
  });
}
