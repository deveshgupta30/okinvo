import { describe, expect, it } from "vitest";
import {
  assetRefs,
  parseFrontMatter,
  pagePath,
  planSync,
  rewriteLinks,
  syncTree,
  type WikiClient,
  type WikiDoc,
} from "../../scripts/wiki-sync";

/**
 * `pnpm docs:sync` (spec §9): the markdown tree under docs/wiki is the source of truth and is
 * upserted into Wiki.js through its GraphQL API, keyed by page path, so a second run with no
 * changes sends nothing. Front matter carries title, path and order; relative links between
 * pages and `assets/<file>` images are rewritten to the wiki's absolute paths.
 */
describe("parseFrontMatter", () => {
  it("reads title, path, order and description and returns the body", () => {
    const doc = parseFrontMatter(
      "---\ntitle: Getting started\npath: getting-started\norder: 2\ndescription: Install and sign in\n---\n\n# Hello\n",
    );
    expect(doc).toEqual({
      title: "Getting started",
      path: "getting-started",
      order: 2,
      description: "Install and sign in",
      body: "# Hello\n",
    });
  });

  it("rejects a file without a title", () => {
    expect(() => parseFrontMatter("---\npath: x\n---\nbody")).toThrow(/title/);
  });

  it("rejects a file without front matter", () => {
    expect(() => parseFrontMatter("# No front matter\n")).toThrow(/front matter/);
  });
});

describe("pagePath", () => {
  it("prefers the front-matter path", () => {
    expect(pagePath("operations/compose.md", "ops-compose")).toBe("ops-compose");
  });
  it("derives the path from the file name, index.md being the folder or home", () => {
    expect(pagePath("clients.md")).toBe("clients");
    expect(pagePath("operations/kubernetes.md")).toBe("operations/kubernetes");
    expect(pagePath("operations/index.md")).toBe("operations");
    expect(pagePath("index.md")).toBe("home");
  });
  it("rejects a path outside the wiki (leading slash, dot segments, bad characters)", () => {
    expect(() => pagePath("x.md", "/abs")).toThrow();
    expect(() => pagePath("x.md", "../up")).toThrow();
    expect(() => pagePath("x.md", "Has Space")).toThrow();
  });
});

describe("rewriteLinks", () => {
  it("rewrites relative page links to absolute wiki paths and assets to the assets folder", () => {
    const body =
      "See [clients](clients.md), [compose](./compose.md#ports) and ![shot](assets/dashboard-dark.png). Keep [ext](https://example.com/x.md).";
    expect(rewriteLinks(body, "operations/kubernetes")).toBe(
      "See [clients](/operations/clients), [compose](/operations/compose#ports) and ![shot](/assets/dashboard-dark.png). Keep [ext](https://example.com/x.md).",
    );
  });
  it("resolves ../ against the page's folder", () => {
    expect(rewriteLinks("[home](../index.md)", "operations/compose")).toBe("[home](/home)");
  });
});

describe("assetRefs", () => {
  it("lists every assets/<file> image referenced in a body once", () => {
    expect(
      assetRefs(
        "![a](assets/a.png) ![b](assets/b.png) ![a again](assets/a.png) ![x](https://h/x.png)",
      ),
    ).toEqual(["a.png", "b.png"]);
  });
});

const docs: WikiDoc[] = [
  { file: "index.md", title: "okinvo", path: "home", order: 0, description: "", body: "Welcome" },
  {
    file: "clients.md",
    title: "Clients",
    path: "clients",
    order: 3,
    description: "Manage clients",
    body: "![list](assets/clients-dark.png)",
  },
];

describe("planSync", () => {
  it("creates missing pages, updates changed ones and skips identical ones, in order", () => {
    const plan = planSync(docs, [
      { id: 7, path: "clients", title: "Clients", description: "Manage clients", content: "old" },
      { id: 9, path: "stale", title: "Stale", description: "", content: "" },
    ]);
    expect(plan.map((p) => [p.op, p.path])).toEqual([
      ["create", "home"],
      ["update", "clients"],
    ]);
    const update = plan[1]!;
    expect(update.op === "update" && update.id).toBe(7);
    expect(update.content).toBe("![list](/assets/clients-dark.png)");
    // a page that already matches is not touched
    const again = planSync(docs, [
      { id: 1, path: "home", title: "okinvo", description: "", content: "Welcome" },
      {
        id: 7,
        path: "clients",
        title: "Clients",
        description: "Manage clients",
        content: "![list](/assets/clients-dark.png)",
      },
    ]);
    expect(again).toEqual([]);
  });
});

function fakeClient(state: {
  pages: { id: number; path: string; title: string; description: string; content: string }[];
  assets: string[];
}) {
  const calls: { query: string; variables: Record<string, unknown> }[] = [];
  const uploads: { folderId: number; filename: string; bytes: Uint8Array }[] = [];
  const client: WikiClient = {
    async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
      calls.push({ query, variables });
      if (query.includes("pages { list")) {
        return { pages: { list: state.pages.map(({ id, path }) => ({ id, path })) } } as T;
      }
      if (query.includes("pages { single")) {
        const page = state.pages.find((p) => p.id === variables["id"]);
        return { pages: { single: page ?? null } } as T;
      }
      if (query.includes("pages { create")) {
        const id = 100 + state.pages.length;
        state.pages.push({
          id,
          path: String(variables["path"]),
          title: String(variables["title"]),
          description: String(variables["description"]),
          content: String(variables["content"]),
        });
        return {
          pages: { create: { responseResult: { succeeded: true, message: "ok" }, page: { id } } },
        } as T;
      }
      if (query.includes("pages { update")) {
        const page = state.pages.find((p) => p.id === variables["id"])!;
        page.content = String(variables["content"]);
        page.title = String(variables["title"]);
        return { pages: { update: { responseResult: { succeeded: true, message: "ok" } } } } as T;
      }
      if (query.includes("assets { folders")) {
        return { assets: { folders: [{ id: 3, slug: "assets", name: "assets" }] } } as T;
      }
      if (query.includes("assets { list")) {
        return { assets: { list: state.assets.map((filename, i) => ({ id: i, filename })) } } as T;
      }
      throw new Error(`unexpected query: ${query}`);
    },
    async upload(folderId, filename, bytes) {
      uploads.push({ folderId, filename, bytes });
      state.assets.push(filename);
    },
  };
  return { client, calls, uploads };
}

describe("syncTree", () => {
  it("uploads missing assets into the assets folder, upserts pages and is idempotent", async () => {
    const state: Parameters<typeof fakeClient>[0] = { pages: [], assets: ["already.png"] };
    const { client, calls, uploads } = fakeClient(state);
    const files = new Map<string, Uint8Array>([
      ["clients-dark.png", new Uint8Array([1, 2, 3])],
      ["already.png", new Uint8Array([9])],
    ]);
    const first = await syncTree(client, docs, (name) => files.get(name) ?? null, {
      dryRun: false,
    });
    expect(first).toEqual({ created: 2, updated: 0, skipped: 0, uploaded: 1 });
    expect(uploads.map((u) => [u.folderId, u.filename])).toEqual([[3, "clients-dark.png"]]);
    const create = calls.find((c) => c.query.includes("pages { create"))!;
    expect(create.variables).toMatchObject({
      path: "home",
      title: "okinvo",
      editor: "markdown",
      locale: "en",
      isPublished: true,
      isPrivate: false,
      tags: [],
    });
    expect(create.query).toContain("responseResult { succeeded errorCode message }");

    const second = await syncTree(client, docs, (name) => files.get(name) ?? null, {
      dryRun: false,
    });
    expect(second).toEqual({ created: 0, updated: 0, skipped: 2, uploaded: 0 });
    expect(uploads).toHaveLength(1);
  });

  it("fails when a referenced asset is missing on disk", async () => {
    const { client } = fakeClient({ pages: [], assets: [] });
    await expect(syncTree(client, docs, () => null, { dryRun: false })).rejects.toThrow(
      /clients-dark\.png/,
    );
  });

  it("sends nothing in dry-run mode but reports the plan", async () => {
    const { client, calls, uploads } = fakeClient({ pages: [], assets: [] });
    const result = await syncTree(client, docs, () => new Uint8Array([1]), { dryRun: true });
    expect(result).toEqual({ created: 2, updated: 0, skipped: 0, uploaded: 1 });
    expect(uploads).toEqual([]);
    expect(calls.some((c) => c.query.includes("pages { create"))).toBe(false);
  });

  it("surfaces a failed mutation with Wiki.js's message", async () => {
    const client: WikiClient = {
      async graphql<T>(query: string): Promise<T> {
        if (query.includes("pages { list")) return { pages: { list: [] } } as T;
        if (query.includes("assets { folders")) {
          return { assets: { folders: [{ id: 3, slug: "assets", name: "assets" }] } } as T;
        }
        if (query.includes("assets { list")) return { assets: { list: [] } } as T;
        return {
          pages: {
            create: { responseResult: { succeeded: false, errorCode: 6002, message: "nope" } },
          },
        } as T;
      },
      async upload() {},
    };
    await expect(
      syncTree(client, docs, () => new Uint8Array([1]), { dryRun: false }),
    ).rejects.toThrow(/nope/);
  });
});
