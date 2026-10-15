import type { Role } from "@/server/actor";

/**
 * API scopes (spec §7.1). A key carries a subset; a role sets the ceiling: viewers get the read
 * scopes, editors and owners everything. The effective scopes of a key are always the
 * intersection of what it stored and what its user's current role allows.
 */
export const SCOPES = [
  "invoices:read",
  "invoices:create",
  "credit_notes:read",
  "credit_notes:create",
  "catalogue:read",
  "documents:read",
  "status:read",
] as const;

export type Scope = (typeof SCOPES)[number];

export const SCOPE_LABELS: Record<Scope, string> = {
  "invoices:read": "Read invoices",
  "invoices:create": "Create and issue invoices",
  "credit_notes:read": "Read credit notes",
  "credit_notes:create": "Create and issue credit notes",
  "catalogue:read": "Read clients, services and products",
  "documents:read": "Download stored PDFs and DOCX copies",
  "status:read": "Read the instance status",
};

export const READ_SCOPES: readonly Scope[] = SCOPES.filter((s) => s.endsWith(":read"));

export function isScope(v: unknown): v is Scope {
  return typeof v === "string" && (SCOPES as readonly string[]).includes(v);
}

/** The most a key held by a user of this role may do. */
export function scopesForRole(role: Role): Scope[] {
  return role === "VIEWER" ? [...READ_SCOPES] : [...SCOPES];
}

/** Stored scopes narrowed to the current ceiling, in catalogue order. */
export function effectiveScopes(stored: readonly string[], role: Role): Scope[] {
  const ceiling = new Set<string>(scopesForRole(role));
  return SCOPES.filter((s) => stored.includes(s) && ceiling.has(s));
}
