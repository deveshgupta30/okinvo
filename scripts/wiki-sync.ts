/**
 * Upserts the documentation tree (docs/wiki/**.md plus docs/wiki/assets) into a Wiki.js 2.5
 * instance through its GraphQL API (spec §9):
 *
 *   WIKI_URL=https://docs.example.com WIKI_TOKEN=... pnpm docs:sync [--dry-run] [--root docs/wiki]
 *
 * Every markdown file carries front matter (`title`, optional `path`, `order`, `description`).
 * Pages are keyed by their wiki path, so a run with no changes sends nothing; `--dry-run` prints
 * the plan without touching the wiki. Relative links between pages become absolute wiki paths
 * and `assets/<file>` images point at the wiki's `assets` folder, where missing files are
 * uploaded through the `/u` endpoint (Wiki.js 2 has no GraphQL upload mutation).
 *
 * The pure pieces (front matter, path derivation, link rewriting, the plan and `syncTree` with an
 * injected client) are unit-tested; only `main` touches the network and the file system.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export type WikiDoc = {
  /** Path of the markdown file relative to the docs root, forward slashes. */
  file: string;
  title: string;
  /** Wiki path (`home`, `clients`, `operations/compose`). */
  path: string;
  order: number;
  description: string;
  /** Markdown body as written in the repo (links not yet rewritten). */
  body: string;
};

export type WikiPage = {
  id: number;
  path: string;
  title: string;
  description: string;
  content: string;
};

export type SyncOp =
  | { op: "create"; path: string; title: string; description: string; content: string }
  | { op: "update"; id: number; path: string; title: string; description: string; content: string };

export type WikiClient = {
  graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
  upload(folderId: number, filename: string, bytes: Uint8Array): Promise<void>;
};

export type SyncResult = { created: number; updated: number; skipped: number; uploaded: number };

export const ASSETS_FOLDER = "assets";
const PATH_RE = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;

/** Splits `---` front matter from the body and validates the fields the sync needs. */
export function parseFrontMatter(text: string): Omit<WikiDoc, "file"> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) throw new Error("missing front matter");
  const raw: unknown = parseYaml(m[1]!);
  const fm = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const title = fm["title"];
  if (typeof title !== "string" || !title.trim()) throw new Error("front matter needs a title");
  const pathValue = fm["path"];
  if (pathValue !== undefined && typeof pathValue !== "string") {
    throw new Error("front matter path must be a string");
  }
  const order = fm["order"];
  if (order !== undefined && (typeof order !== "number" || !Number.isInteger(order))) {
    throw new Error("front matter order must be an integer");
  }
  const description = fm["description"];
  return {
    title: title.trim(),
    path: typeof pathValue === "string" ? pathValue : "",
    order: typeof order === "number" ? order : 0,
    description: typeof description === "string" ? description.trim() : "",
    body: text.slice(m[0].length).replace(/^\r?\n/, ""),
  };
}

/** The wiki path of a file: the front-matter path, else the file path (`index.md` = folder or home). */
export function pagePath(file: string, explicit?: string): string {
  let p = explicit?.trim() ?? "";
  if (!p) {
    const noExt = file.replace(/\\/g, "/").replace(/\.md$/i, "");
    p = noExt === "index" ? "home" : noExt.replace(/\/index$/, "");
  }
  if (!PATH_RE.test(p)) throw new Error(`invalid wiki path "${p}" for ${file}`);
  return p;
}

/** Resolves a relative markdown link target against the page's folder in the wiki. */
function resolvePage(target: string, fromPage: string): string {
  const [pathPart, hash] = target.split("#", 2);
  const folder = fromPage.includes("/") ? fromPage.slice(0, fromPage.lastIndexOf("/")) : "";
  const joined = path.posix.normalize(path.posix.join(folder, pathPart!.replace(/\.md$/i, "")));
  const wiki = joined === "index" ? "home" : joined.replace(/\/index$/, "");
  return `/${wiki}${hash ? `#${hash}` : ""}`;
}

/** Rewrites `x.md` links to absolute wiki paths and `assets/<file>` images to the assets folder. */
export function rewriteLinks(body: string, page: string): string {
  return body.replace(
    /(!?)\[([^\]]*)\]\(([^)\s]+)\)/g,
    (whole, bang: string, text: string, target: string) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("/") || target.startsWith("#")) {
        return whole;
      }
      const clean = target.replace(/^\.\//, "");
      if (clean.startsWith(`${ASSETS_FOLDER}/`)) {
        return `${bang}[${text}](/${ASSETS_FOLDER}/${clean.slice(ASSETS_FOLDER.length + 1)})`;
      }
      if (!bang && /\.md(#[^)]*)?$/i.test(clean)) {
        return `[${text}](${resolvePage(clean, page)})`;
      }
      return whole;
    },
  );
}

/** File names under `assets/` that a body references, in order of first use. */
export function assetRefs(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/!\[[^\]]*\]\((?:\.\/)?assets\/([^)\s]+)\)/g)) {
    if (!out.includes(m[1]!)) out.push(m[1]!);
  }
  return out;
}

/** The create/update operations that bring the wiki in line with the docs; unchanged pages are skipped. */
export function planSync(docs: WikiDoc[], existing: WikiPage[]): SyncOp[] {
  const byPath = new Map(existing.map((p) => [p.path, p]));
  const ops: SyncOp[] = [];
  for (const doc of [...docs].sort((a, b) => a.order - b.order || a.path.localeCompare(b.path))) {
    const content = rewriteLinks(doc.body, doc.path);
    const page = byPath.get(doc.path);
    if (!page) {
      ops.push({
        op: "create",
        path: doc.path,
        title: doc.title,
        description: doc.description,
        content,
      });
    } else if (
      page.content !== content ||
      page.title !== doc.title ||
      page.description !== doc.description
    ) {
      ops.push({
        op: "update",
        id: page.id,
        path: doc.path,
        title: doc.title,
        description: doc.description,
        content,
      });
    }
  }
  return ops;
}

const PAGE_VARS =
  "$content: String!, $description: String!, $editor: String!, $isPublished: Boolean!, $isPrivate: Boolean!, $locale: String!, $path: String!, $tags: [String]!, $title: String!";
const PAGE_FIELDS =
  "content: $content, description: $description, editor: $editor, isPublished: $isPublished, isPrivate: $isPrivate, locale: $locale, path: $path, tags: $tags, title: $title";
/** Every page is a published, public markdown page in the wiki's default locale. */
const PAGE_DEFAULTS = {
  editor: "markdown",
  isPublished: true,
  isPrivate: false,
  locale: "en",
  tags: [] as string[],
};

const LIST_PAGES = "query { pages { list(orderBy: PATH) { id path } } }";
const SINGLE_PAGE =
  "query ($id: Int!) { pages { single(id: $id) { id path title description content } } }";
const CREATE_PAGE = `mutation (${PAGE_VARS}) { pages { create(${PAGE_FIELDS}) { responseResult { succeeded errorCode message } page { id } } } }`;
const UPDATE_PAGE = `mutation ($id: Int!, ${PAGE_VARS}) { pages { update(id: $id, ${PAGE_FIELDS}) { responseResult { succeeded errorCode message } } } }`;
const LIST_FOLDERS = "query { assets { folders(parentFolderId: 0) { id slug name } } }";
const CREATE_FOLDER = `mutation { assets { createFolder(parentFolderId: 0, slug: "${ASSETS_FOLDER}", name: "${ASSETS_FOLDER}") { responseResult { succeeded errorCode message } } } }`;
const LIST_ASSETS =
  "query ($folderId: Int!) { assets { list(folderId: $folderId, kind: ALL) { id filename } } }";

type ResponseResult = { succeeded: boolean; errorCode?: number; message?: string };

function assertOk(what: string, r: ResponseResult | undefined): void {
  if (!r?.succeeded) {
    throw new Error(`${what} failed: ${r?.message ?? "no response"} (code ${r?.errorCode ?? "?"})`);
  }
}

async function ensureAssetsFolder(client: WikiClient): Promise<number> {
  const find = async () => {
    const r = await client.graphql<{ assets: { folders: { id: number; slug: string }[] } }>(
      LIST_FOLDERS,
    );
    return r.assets.folders.find((f) => f.slug === ASSETS_FOLDER)?.id;
  };
  const id = await find();
  if (id !== undefined) return id;
  const created = await client.graphql<{
    assets: { createFolder: { responseResult: ResponseResult } };
  }>(CREATE_FOLDER);
  assertOk("assets.createFolder", created.assets.createFolder.responseResult);
  const again = await find();
  if (again === undefined) throw new Error("assets folder not found after creation");
  return again;
}

/**
 * Uploads the assets the docs reference (skipping ones the wiki already holds) and applies the
 * page plan. `readAsset` returns a file's bytes or null when it does not exist on disk.
 */
export async function syncTree(
  client: WikiClient,
  docs: WikiDoc[],
  readAsset: (filename: string) => Uint8Array | null,
  o: { dryRun: boolean; log?: (line: string) => void },
): Promise<SyncResult> {
  const log = o.log ?? (() => {});
  const result: SyncResult = { created: 0, updated: 0, skipped: 0, uploaded: 0 };

  const wanted = new Set<string>();
  for (const doc of docs) for (const name of assetRefs(doc.body)) wanted.add(name);
  const assets = new Map<string, Uint8Array>();
  for (const name of wanted) {
    const bytes = readAsset(name);
    if (!bytes) throw new Error(`asset ${name} is referenced but missing under ${ASSETS_FOLDER}/`);
    assets.set(name, bytes);
  }

  const folderId = await ensureAssetsFolder(client);
  const listed = await client.graphql<{ assets: { list: { id: number; filename: string }[] } }>(
    LIST_ASSETS,
    { folderId },
  );
  const present = new Set(listed.assets.list.map((a) => a.filename));
  for (const [name, bytes] of assets) {
    if (present.has(name)) continue;
    log(`upload ${ASSETS_FOLDER}/${name} (${bytes.byteLength} bytes)`);
    if (!o.dryRun) await client.upload(folderId, name, bytes);
    result.uploaded++;
  }

  const list = await client.graphql<{ pages: { list: { id: number; path: string }[] } }>(
    LIST_PAGES,
  );
  const wantedPaths = new Set(docs.map((d) => d.path));
  const existing: WikiPage[] = [];
  for (const { id, path: p } of list.pages.list) {
    if (!wantedPaths.has(p)) continue;
    const r = await client.graphql<{ pages: { single: WikiPage | null } }>(SINGLE_PAGE, { id });
    if (r.pages.single) existing.push(r.pages.single);
  }

  const plan = planSync(docs, existing);
  result.skipped = docs.length - plan.length;
  for (const op of plan) {
    log(`${op.op} /${op.path} (${op.title})`);
    if (op.op === "create") {
      if (!o.dryRun) {
        const r = await client.graphql<{
          pages: { create: { responseResult: ResponseResult; page?: { id: number } } };
        }>(CREATE_PAGE, {
          ...PAGE_DEFAULTS,
          content: op.content,
          description: op.description,
          path: op.path,
          title: op.title,
        });
        assertOk(`pages.create /${op.path}`, r.pages.create.responseResult);
      }
      result.created++;
    } else {
      if (!o.dryRun) {
        const r = await client.graphql<{ pages: { update: { responseResult: ResponseResult } } }>(
          UPDATE_PAGE,
          {
            ...PAGE_DEFAULTS,
            id: op.id,
            content: op.content,
            description: op.description,
            path: op.path,
            title: op.title,
          },
        );
        assertOk(`pages.update /${op.path}`, r.pages.update.responseResult);
      }
      result.updated++;
    }
  }
  return result;
}

/** Reads every markdown file under `root` (except the assets folder) into WikiDocs. */
export function loadDocs(root: string): WikiDoc[] {
  const docs: WikiDoc[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (dir === root && entry === ASSETS_FOLDER) continue;
        walk(full);
      } else if (/\.md$/i.test(entry)) {
        const file = path.relative(root, full).replace(/\\/g, "/");
        const fm = parseFrontMatter(readFileSync(full, "utf8"));
        docs.push({ ...fm, file, path: pagePath(file, fm.path) });
      }
    }
  };
  walk(root);
  const seen = new Map<string, string>();
  for (const d of docs) {
    const other = seen.get(d.path);
    if (other) throw new Error(`wiki path /${d.path} is used by both ${other} and ${d.file}`);
    seen.set(d.path, d.file);
  }
  return docs;
}

/** A client against a live Wiki.js: GraphQL at /graphql, uploads through /u, both with the API token. */
export function httpClient(baseUrl: string, token: string): WikiClient {
  const base = baseUrl.replace(/\/+$/, "");
  const auth = { Authorization: `Bearer ${token}` };
  return {
    async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
      const res = await fetch(`${base}/graphql`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      if (!res.ok) throw new Error(`GraphQL HTTP ${res.status} ${res.statusText}`);
      const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
      if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
      if (!json.data) throw new Error("GraphQL response without data");
      return json.data;
    },
    async upload(folderId, filename, bytes) {
      const form = new FormData();
      form.append("mediaUpload", JSON.stringify({ folderId }));
      form.append("mediaUpload", new Blob([Uint8Array.from(bytes)]), filename);
      const res = await fetch(`${base}/u`, { method: "POST", headers: auth, body: form });
      if (!res.ok) throw new Error(`upload ${filename}: HTTP ${res.status} ${res.statusText}`);
    },
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const rootArg = args[args.indexOf("--root") + 1];
  const root = path.resolve(
    args.includes("--root") && rootArg
      ? rootArg
      : path.join(import.meta.dirname, "..", "docs", "wiki"),
  );
  const url = process.env["WIKI_URL"];
  const token = process.env["WIKI_TOKEN"];
  if (!url || !token) {
    console.error(
      "WIKI_URL and WIKI_TOKEN are required (a Wiki.js API key with pages and assets rights)",
    );
    process.exit(2);
  }
  const docs = loadDocs(root);
  console.log(
    `${docs.length} pages under ${path.relative(process.cwd(), root)}${dryRun ? " (dry run)" : ""}`,
  );
  const readAsset = (name: string) => {
    const full = path.join(root, ASSETS_FOLDER, name);
    try {
      return new Uint8Array(readFileSync(full));
    } catch {
      return null;
    }
  };
  const result = await syncTree(httpClient(url, token), docs, readAsset, {
    dryRun,
    log: (line) => console.log(`  ${line}`),
  });
  console.log(
    `created ${result.created}, updated ${result.updated}, unchanged ${result.skipped}, assets uploaded ${result.uploaded}`,
  );
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (invokedDirectly) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
