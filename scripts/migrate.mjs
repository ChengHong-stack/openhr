// Applies prisma/migrations/*/migration.sql in order, once each, inside a transaction.
// Compatible with Prisma's folder layout; generate new SQL with:
//   npx prisma migrate diff --from-schema-datamodel <old> --to-schema-datamodel prisma/schema.prisma --script
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const dir = path.resolve(process.argv[2] ?? "prisma/migrations");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

for (let i = 0; ; i++) {
  try { await client.connect(); break; }
  catch (e) {
    if (i >= 30) throw e;
    console.log("Waiting for database…");
    await new Promise((r) => setTimeout(r, 2000));
  }
}
await client.query(`CREATE TABLE IF NOT EXISTS "_openhr_migrations" (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
await client.query("SELECT pg_advisory_lock(727274)");
try {
  const done = new Set((await client.query(`SELECT name FROM "_openhr_migrations"`)).rows.map((r) => r.name));
  const names = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  let applied = 0;
  for (const name of names) {
    if (done.has(name)) continue;
    const sql = await readFile(path.join(dir, name, "migration.sql"), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(`INSERT INTO "_openhr_migrations"(name) VALUES ($1)`, [name]);
      await client.query("COMMIT");
      console.log(`Applied ${name}`);
      applied++;
    } catch (e) {
      await client.query("ROLLBACK");
      console.error(`Migration ${name} failed:`, e.message);
      process.exitCode = 1;
      break;
    }
  }
  if (!applied && !process.exitCode) console.log("Database is up to date.");
} finally {
  await client.query("SELECT pg_advisory_unlock(727274)");
  await client.end();
}
