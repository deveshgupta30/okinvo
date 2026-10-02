import "server-only";
import { parseAccent, type AccentId } from "@/lib/accent";
import { prisma } from "@/lib/db";
import type { AccountInput, Usage } from "@/lib/schemas/account-input";
import { USAGES } from "@/lib/schemas/account-input";
import { parseThemeMode, type ThemeMode } from "@/lib/theme";
import type { Actor } from "@/server/actor";
import { audit } from "./audit";
import { diffForAudit } from "./audit-redact";
import { NotFoundError } from "./errors";

export interface AccountDto {
  id: string;
  name: string;
  email: string;
  timezone: string | null;
  theme: ThemeMode;
  accent: AccentId;
  countryCode: string | null;
  currency: string | null;
  locale: string;
  usage: Usage | null;
  onboardedAt: string | null;
  /** Storage key of the AVATAR asset, for `/api/assets/<key>`; null means "show initials". */
  avatarKey: string | null;
  createdAt: string;
}

const WITH_AVATAR = { avatar: { select: { storageKey: true } } } as const;
type Row = Awaited<ReturnType<typeof loadRow>>;

async function loadRow(tx: Pick<typeof prisma, "user">, userId: string) {
  const row = await tx.user.findUnique({ where: { id: userId }, include: WITH_AVATAR });
  if (!row) throw new NotFoundError("User", userId);
  return row;
}

function toDto(row: Row): AccountDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    timezone: row.timezone,
    theme: parseThemeMode(row.theme),
    accent: parseAccent(row.accent),
    countryCode: row.countryCode,
    currency: row.currency,
    locale: row.locale,
    usage: (USAGES as readonly string[]).includes(row.usage ?? "") ? (row.usage as Usage) : null,
    onboardedAt: row.onboardedAt?.toISOString() ?? null,
    avatarKey: row.avatar?.storageKey ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The audited view of the preference columns (what diffs appear in the audit log). */
const prefs = (u: {
  name: string;
  timezone: string | null;
  theme: string | null;
  accent: string;
  countryCode: string | null;
  currency: string | null;
  locale: string;
}) => ({
  name: u.name,
  timezone: u.timezone,
  theme: u.theme,
  accent: u.accent,
  countryCode: u.countryCode,
  currency: u.currency,
  locale: u.locale,
});

export async function getAccount(actor: Actor): Promise<AccountDto> {
  return toDto(await loadRow(prisma, actor.userId));
}

/** Settings → Account: display name, timezone, theme, language, country, currency (SPEC §4.1, §4.13). */
export async function updateAccount(actor: Actor, input: AccountInput): Promise<AccountDto> {
  return prisma.$transaction(async (tx) => {
    const before = await loadRow(tx, actor.userId);
    const row = await tx.user.update({
      where: { id: actor.userId },
      data: {
        name: input.name,
        timezone: input.timezone,
        theme: input.theme,
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
        ...(input.countryCode !== undefined ? { countryCode: input.countryCode } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
      },
      include: WITH_AVATAR,
    });
    const diff = diffForAudit(prefs(before), prefs(row));
    await audit(tx, actor, "account.updated", "User", actor.userId, {
      summary: "Updated account preferences",
      before: diff.before,
      after: diff.after,
    });
    return toDto(row);
  });
}

async function setPreference(
  actor: Actor,
  data: { theme?: ThemeMode; accent?: AccentId },
  summary: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const before = await loadRow(tx, actor.userId);
    const row = await tx.user.update({ where: { id: actor.userId }, data, include: WITH_AVATAR });
    const diff = diffForAudit(prefs(before), prefs(row));
    await audit(tx, actor, "account.updated", "User", actor.userId, {
      summary,
      before: diff.before,
      after: diff.after,
    });
  });
}

/** The sidebar theme toggle (spec §3.3); the caller mirrors the value to the okinvo.theme cookie. */
export async function setTheme(actor: Actor, theme: ThemeMode): Promise<void> {
  await setPreference(actor, { theme }, `Theme set to ${theme}`);
}

/** Settings → Appearance accent picker (spec §3.4); mirrored to the okinvo.accent cookie by the caller. */
export async function setAccent(actor: Actor, accent: AccentId): Promise<void> {
  await setPreference(actor, { accent }, `Accent set to ${accent}`);
}

/**
 * Links an uploaded AVATAR asset to the account, or clears it with null. The asset must exist
 * and be an avatar; the old asset row is kept (storage is reconciled by the asset DAL's own
 * orphan handling, as for issuer artwork).
 */
export async function setAvatar(actor: Actor, assetId: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const before = await loadRow(tx, actor.userId);
    if (assetId !== null) {
      const asset = await tx.asset.findUnique({ where: { id: assetId }, select: { kind: true } });
      if (!asset || asset.kind !== "AVATAR") throw new NotFoundError("Avatar", assetId);
    }
    await tx.user.update({ where: { id: actor.userId }, data: { avatarAssetId: assetId } });
    await audit(tx, actor, "account.avatar", "User", actor.userId, {
      summary: assetId ? "Profile photo changed" : "Profile photo removed",
      before: { avatarAssetId: before.avatarAssetId },
      after: { avatarAssetId: assetId },
    });
  });
}
