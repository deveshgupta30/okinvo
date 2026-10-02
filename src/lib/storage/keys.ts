/**
 * Storage keys (v2 §11.1): `assets/{kind}/{yyyy}/{assetId}.{ext}` and
 * `documents/{invoices|credit-notes}/{fy}/{number-safe}-v{n}.pdf`. Keys are lower-case,
 * forward-slash paths; every driver validates them with `assertValidKey` before touching a path
 * or an object name, so a key can never name anything outside the storage root.
 */
export const KEY_PATTERN = /^[a-z0-9][a-z0-9/_\-.]*$/;

/** S3 allows 1024 bytes; local file systems are happiest well under that. */
export const MAX_KEY_LENGTH = 512;

/** The local driver's metadata sidecar; no key may end with it. */
export const SIDECAR_SUFFIX = ".meta.json";

export type AssetKind = "LOGO" | "SIGNATURE" | "STAMP" | "RECEIPT" | "AVATAR" | "LETTERHEAD";
export type DocumentKeyKind = "INVOICE" | "CREDIT_NOTE";
export type StoredExtension = "png" | "jpg" | "webp" | "pdf";

export class InvalidStorageKeyError extends Error {
  override readonly name = "InvalidStorageKeyError";
  constructor(
    readonly key: string,
    reason: string,
  ) {
    super(`invalid storage key ${JSON.stringify(key)}: ${reason}`);
  }
}

const PATTERN_MESSAGE = "must be lower-case [a-z0-9/_-.] and start with a letter or digit";

function assertSegment(key: string, segment: string): void {
  if (segment === "") throw new InvalidStorageKeyError(key, "empty path segment");
  if (segment.startsWith(".")) throw new InvalidStorageKeyError(key, "segment starts with a dot");
}

/** Rejects empty, `..`, leading `/`, uppercase, dot-led or empty segments and the sidecar suffix. */
export function assertValidKey(key: string): void {
  if (key.length === 0) throw new InvalidStorageKeyError(key, "empty");
  if (key.length > MAX_KEY_LENGTH) throw new InvalidStorageKeyError(key, "too long");
  if (!KEY_PATTERN.test(key)) throw new InvalidStorageKeyError(key, PATTERN_MESSAGE);
  for (const segment of key.split("/")) assertSegment(key, segment);
  if (key.endsWith(SIDECAR_SUFFIX)) {
    throw new InvalidStorageKeyError(key, `reserved suffix ${SIDECAR_SUFFIX}`);
  }
}

/**
 * A `list()` prefix is the start of a key, so its last segment may be partial or empty
 * (`assets/logo/`), but it must obey every other key rule. The empty prefix lists everything.
 */
export function assertValidKeyPrefix(prefix: string): void {
  if (prefix === "") return;
  if (prefix.length > MAX_KEY_LENGTH) throw new InvalidStorageKeyError(prefix, "too long");
  if (!/^[a-z0-9/_\-.]*$/.test(prefix)) throw new InvalidStorageKeyError(prefix, PATTERN_MESSAGE);
  const segments = prefix.split("/");
  segments.forEach((segment, i) => {
    if (i === segments.length - 1 && segment === "") return;
    assertSegment(prefix, segment);
  });
}

/** A caller-supplied part must be exactly one segment: no slashes, same character rules. */
function assertSingleSegment(part: string, what: string): void {
  if (part.includes("/")) {
    throw new InvalidStorageKeyError(part, `${what} must not contain "/"`);
  }
}

/** `assets/{kind lower}/{yyyy}/{assetId}.{ext}`; the year is the UTC year of `now`. */
export function assetKey(
  kind: AssetKind,
  assetId: string,
  ext: StoredExtension,
  now: Date = new Date(),
): string {
  assertSingleSegment(assetId, "asset id");
  const key = `assets/${kind.toLowerCase()}/${now.getUTCFullYear()}/${assetId}.${ext}`;
  assertValidKey(key);
  return key;
}

const DOCUMENT_FOLDERS: Record<DocumentKeyKind, string> = {
  INVOICE: "invoices",
  CREDIT_NOTE: "credit-notes",
};

/** `documents/{invoices|credit-notes}/{fy}/{numberSafe}-v{n}.pdf`. */
export function documentKey(
  kind: DocumentKeyKind,
  issuerProfileId: string,
  fiscalYear: string,
  numberSafe: string,
  version: number,
): string {
  if (!Number.isInteger(version) || version < 1) {
    throw new RangeError(`document version must be a positive integer, got ${String(version)}`);
  }
  // Numbers are unique per issuer (SPEC §4.6): the issuer id keeps two profiles' INV/26-27/001 apart.
  assertSingleSegment(issuerProfileId, "issuer profile id");
  assertSingleSegment(fiscalYear, "fiscal year");
  assertSingleSegment(numberSafe, "document number");
  const key = `documents/${DOCUMENT_FOLDERS[kind]}/${issuerProfileId}/${fiscalYear}/${numberSafe}-v${version}.pdf`;
  assertValidKey(key);
  return key;
}

const EXTENSIONS: ReadonlyMap<string, StoredExtension> = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["application/pdf", "pdf"],
]);

export function extensionFor(contentType: string): StoredExtension {
  const ext = EXTENSIONS.get(contentType);
  if (!ext) throw new Error(`unsupported content type: ${JSON.stringify(contentType)}`);
  return ext;
}
