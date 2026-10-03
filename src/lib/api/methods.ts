/**
 * The versioned API and the MCP endpoint never delete or rewrite (spec §7.2, §7.4): DELETE, PUT
 * and PATCH are answered 405 with an Allow header before any handler runs.
 */
const DESTRUCTIVE = new Set(["DELETE", "PUT", "PATCH"]);

export function disallowedVerb(method: string, pathname: string): boolean {
  if (!DESTRUCTIVE.has(method.toUpperCase())) return false;
  return (
    pathname.startsWith("/api/v1/") || pathname === "/api/v1" || pathname.startsWith("/api/mcp")
  );
}

export const ALLOW_HEADER = "GET, POST, OPTIONS";
