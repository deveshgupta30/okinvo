// Fails when replaying prisma/migrations into an empty shadow database does not produce
// prisma/schema.prisma — i.e. someone edited the schema without a migration, or a hand-written
// migration (partial unique indexes, per-issuer numbering) drifted from what the schema says.
import "dotenv/config";
import { execSync } from "node:child_process";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const shadowUrl = process.env.SHADOW_DATABASE_URL ?? deriveShadowUrl(databaseUrl);

function deriveShadowUrl(url) {
  const u = new URL(url);
  u.pathname = `${u.pathname.replace(/\/$/, "")}_shadow`;
  return u.toString();
}

async function ensureShadowDatabase() {
  const name = new URL(shadowUrl).pathname.slice(1);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (exists.rowCount === 0)
      await client.query(`CREATE DATABASE "${name.replaceAll('"', '""')}"`);
  } finally {
    await client.end();
  }
}

await ensureShadowDatabase();
try {
  // Prisma 7 reads the shadow database from prisma.config.ts (datasource.shadowDatabaseUrl),
  // which we feed through SHADOW_DATABASE_URL. The command is a constant string on purpose.
  execSync(
    "pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code",
    { stdio: "inherit", env: { ...process.env, SHADOW_DATABASE_URL: shadowUrl } },
  );
  console.log("db:check ok — migrations and schema.prisma agree");
} catch (error) {
  const code = typeof error?.status === "number" ? error.status : 1;
  console.error(
    code === 2
      ? "db:check FAILED — migrations replayed into the shadow database differ from schema.prisma"
      : "db:check errored (see above)",
  );
  process.exit(1);
}
