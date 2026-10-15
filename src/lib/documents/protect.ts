/**
 * Permissions baked into a password-protected copy (spec §5.5): the reader may open it with the
 * user password, read it, print it at full quality and have it read aloud. Copying text,
 * editing, annotating, form filling and page assembly need the owner password, which the app
 * keeps to itself.
 */
export const PROTECT_PERMISSIONS = {
  printing: "highResolution",
  copying: false,
  modifying: false,
  annotating: false,
  fillingForms: false,
  contentAccessibility: true,
  documentAssembly: false,
} as const;

export interface ProtectOptions {
  /** What the recipient types to open the file. */
  userPassword: string;
  /** Unlocks every permission; generated per copy and never shown to anyone. */
  ownerPassword: string;
}
