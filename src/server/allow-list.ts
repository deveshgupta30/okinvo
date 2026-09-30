export interface AllowList {
  emails: Set<string>;
  domains: Set<string>;
}

const DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}$/;
const EMAIL = /^[^\s@]+@[a-z0-9.-]+\.[a-z]{2,}$/;

/** Parses AUTH_ALLOWED_EMAILS: comma-separated exact addresses and `*@domain` patterns. Throws on malformed entries. */
export function parseAllowedEmails(raw: string | undefined): AllowList {
  const emails = new Set<string>();
  const domains = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const original = part.trim();
    const entry = original.toLowerCase();
    if (!entry) continue;
    if (entry.startsWith("*@")) {
      const domain = entry.slice(2);
      if (!DOMAIN.test(domain)) {
        throw new Error(`AUTH_ALLOWED_EMAILS: invalid domain pattern "${original}"`);
      }
      domains.add(domain);
      continue;
    }
    if (!EMAIL.test(entry)) throw new Error(`AUTH_ALLOWED_EMAILS: invalid entry "${original}"`);
    emails.add(entry);
  }
  return { emails, domains };
}

export function isAllowedEmail(email: string, list: AllowList): boolean {
  const normalised = email.trim().toLowerCase();
  const at = normalised.lastIndexOf("@");
  if (at < 1 || at === normalised.length - 1) return false;
  return list.emails.has(normalised) || list.domains.has(normalised.slice(at + 1));
}
