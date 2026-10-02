/**
 * The dashboard greeting's name (spec §3.6): the first word of the display name, else the e-mail's
 * local part, else a neutral "there" ("Hi, there").
 */
export function firstNameOf(name: string, email: string): string {
  const first = name.trim().split(/\s+/)[0];
  if (first) return first;
  const local = email.split("@")[0]?.trim();
  return local || "there";
}
