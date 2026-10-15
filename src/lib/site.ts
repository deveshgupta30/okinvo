/**
 * The instance's public origin for metadata that must be absolute (metadataBase, the sitemap,
 * robots). Read from APP_URL directly, without the validated env module: the metadata files run
 * at build time where the full schema would demand secrets, and a wrong origin here is cosmetic.
 */
export function publicOrigin(): string {
  const raw = process.env.APP_URL?.trim();
  if (!raw) return "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}
