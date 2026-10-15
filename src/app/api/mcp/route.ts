import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { apiError } from "@/lib/api/errors";
import { errorResponse, MAX_BODY_BYTES } from "@/lib/api/handlers";
import { findDisallowed } from "@/lib/input-charset";
import { buildMcpServer } from "@/lib/mcp/server";
import { requireApiScopes } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mcp - the MCP server over Streamable HTTP (spec §7.4), stateless: every request
 * authenticates with a bearer API key, gets a server built for that key's scopes, and is answered
 * as JSON. No sessions, no SSE stream to resume, nothing to delete - GET and DELETE are 405.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireApiScopes(request.headers);
  if (auth instanceof Response) return auth;

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return apiError("bad_request", "The body is too large.", 413);
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return apiError("bad_request", "The body is too large.", 413);
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(text);
  } catch {
    return apiError("bad_request", "The body is not valid JSON.", 400);
  }
  const charset = findDisallowed(parsedBody);
  if (charset.length) {
    return apiError(
      "bad_charset",
      "Only standard keyboard characters are allowed.",
      400,
      charset.map((v) => ({
        path: v.path,
        message: `disallowed character ${JSON.stringify(v.char)}`,
      })),
    );
  }

  const server = buildMcpServer(auth.actor, auth.scopes);
  // no sessionIdGenerator: stateless, one server per request
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  try {
    await server.connect(transport);
    // JSON mode resolves once every response in the batch is ready, so closing afterwards is safe.
    return await transport.handleRequest(request, { parsedBody });
  } catch (e) {
    return errorResponse(e);
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

function methodNotAllowed(method: string): Response {
  return Response.json(
    { error: { code: "method_not_allowed", message: `${method} is not offered here.` } },
    { status: 405, headers: { Allow: "POST, OPTIONS" } },
  );
}

/** The stateless transport has no stream to open or session to end (spec §7.4). */
export async function GET(_request: Request): Promise<Response> {
  return methodNotAllowed("GET");
}
export async function DELETE(_request: Request): Promise<Response> {
  return methodNotAllowed("DELETE");
}
export async function PUT(_request: Request): Promise<Response> {
  return methodNotAllowed("PUT");
}
export async function PATCH(_request: Request): Promise<Response> {
  return methodNotAllowed("PATCH");
}
