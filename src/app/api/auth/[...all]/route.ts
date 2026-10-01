import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth-config";
import { enforceRateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

const handler = toNextJsHandler(auth);

export const GET = handler.GET;

/**
 * Sign-in, sign-up, password and sign-out calls are POSTs: 20 per minute per client IP (v2 §14).
 * GET (session reads, OAuth callbacks) stays unlimited — the client polls `get-session`.
 */
export async function POST(request: Request): Promise<Response> {
  const limited = await enforceRateLimit(request.headers, "auth");
  if (limited) return limited;
  return handler.POST(request);
}
