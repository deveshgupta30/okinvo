import "server-only";
import { canonicalLocale, DEFAULT_LOCALE } from "@/lib/i18n/languages";
import { generateApiKey, hashApiKey, isApiKey } from "@/lib/api/keys";
import { effectiveScopes, isScope, scopesForRole, type Scope } from "@/lib/api/scopes";
import { prisma } from "@/lib/db";
import { isAdmitted } from "@/server/admission";
import { parseRole, type Actor } from "@/server/actor";
import { audit } from "./audit";
import { requireRole } from "./authz";
import { ForbiddenError, InvariantError, NotFoundError } from "./errors";

/**
 * API keys (spec §7.1): long-lived bearer credentials shown once, stored hashed, scoped, and
 * always capped by the owning user's current role. Revocation and deactivation end them at once.
 */
export interface ApiKeyDto {
  id: string;
  name: string;
  prefix: string;
  scopes: Scope[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  userId: string;
  userName: string;
}

export interface CreateApiKeyInput {
  name: string;
  scopes: readonly string[];
  expiresInDays?: 30 | 90 | 365 | null | undefined;
}

type Row = NonNullable<Awaited<ReturnType<typeof prisma.apiKey.findUnique>>> & {
  user: { name: string; role: string };
};

const include = { user: { select: { name: true, role: true } } } as const;

function toDto(row: Row): ApiKeyDto {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: effectiveScopes(row.scopes, parseRole(row.user.role)),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    userId: row.userId,
    userName: row.user.name,
  };
}

/** Creates a key for the actor; the plain key is returned exactly once. */
export async function createApiKey(
  actor: Actor,
  input: CreateApiKeyInput,
): Promise<{ key: string; dto: ApiKeyDto }> {
  requireRole(actor, "VIEWER");
  const name = input.name.trim();
  if (!name) throw new InvariantError("Give the key a name.", { name: ["required"] });
  const scopes = [...new Set(input.scopes)].filter(isScope);
  if (scopes.length === 0)
    throw new InvariantError("Pick at least one scope.", { scopes: ["required"] });
  const ceiling = new Set(scopesForRole(actor.role));
  const over = scopes.filter((s) => !ceiling.has(s));
  if (over.length) {
    throw new ForbiddenError(`Your role cannot grant ${over.join(", ")}.`);
  }
  const days = input.expiresInDays ?? null;
  if (days !== null && ![30, 90, 365].includes(days)) {
    throw new InvariantError("A key expires in 30, 90 or 365 days, or never.");
  }
  const generated = generateApiKey();
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.apiKey.create({
      data: {
        name,
        prefix: generated.prefix,
        keyHash: generated.hash,
        scopes,
        expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null,
        userId: actor.userId,
      },
      include,
    });
    await audit(tx, actor, "api_key.created", "ApiKey", created.id, {
      summary: `Created API key ${name} (${generated.prefix}…)`,
      after: { name, prefix: generated.prefix, scopes, expiresAt: created.expiresAt },
    });
    return created;
  });
  return { key: generated.key, dto: toDto(row) };
}

/** Own keys; owners see every key of the instance. */
export async function listApiKeys(actor: Actor): Promise<ApiKeyDto[]> {
  const rows = await prisma.apiKey.findMany({
    where: actor.role === "OWNER" ? {} : { userId: actor.userId },
    include,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDto);
}

export async function revokeApiKey(actor: Actor, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const row = await tx.apiKey.findUnique({ where: { id } });
    if (!row) throw new NotFoundError("ApiKey", id);
    if (row.userId !== actor.userId && actor.role !== "OWNER") {
      throw new ForbiddenError("You can revoke only your own keys.");
    }
    if (row.revokedAt) return;
    await tx.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await audit(tx, actor, "api_key.revoked", "ApiKey", id, {
      summary: `Revoked API key ${row.name} (${row.prefix}…)`,
    });
  });
}

/** Every live key of a user ends at once (deactivation, Settings → Users). */
export async function revokeAllApiKeys(
  tx: Parameters<typeof audit>[0],
  userId: string,
): Promise<number> {
  const r = await tx.apiKey.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return r.count;
}

export interface ApiKeyAuth {
  actor: Actor;
  scopes: Scope[];
}

const TOUCH_INTERVAL_MS = 60_000;

/**
 * Resolves a plain key to its user. Null for unknown, revoked, expired keys and for deactivated
 * or no-longer-admitted users. Scopes are the stored set narrowed to the user's current role.
 */
export async function authenticateApiKey(plain: string): Promise<ApiKeyAuth | null> {
  if (!isApiKey(plain)) return null;
  const row = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(plain) },
    include: { user: true },
  });
  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
  if (row.user.deactivatedAt || !(await isAdmitted(row.user.email))) return null;
  const role = parseRole(row.user.role);
  const now = Date.now();
  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    // best effort; a lost touch is not worth failing the request
    prisma.apiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date(now) } })
      .catch(() => undefined);
  }
  return {
    actor: {
      userId: row.user.id,
      email: row.user.email.trim().toLowerCase(),
      name: row.user.name,
      role,
      timezone: row.user.timezone || "UTC",
      locale: canonicalLocale(row.user.locale) ?? DEFAULT_LOCALE,
      via: "api-key",
      apiKeyId: row.id,
      apiKeyName: row.name,
    },
    scopes: effectiveScopes(row.scopes, role),
  };
}
