#!/usr/bin/env bun
// Runner de migrations SQL — sem ORM. Lê db/migrations/*.up.sql em ordem (prefixo
// numérico decide a ordem), aplica cada uma em transação e registra em
// `schema_migrations`. `down` reverte só a última aplicada.
// Uso: bun run packages/db/src/migrate.ts <up|down|status>
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sql } from "./client.ts";

const MIGRATIONS_DIR = resolve(import.meta.dir, "../../../db/migrations");

async function ensureMigrationsTable() {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id serial PRIMARY KEY,
      name text NOT NULL UNIQUE,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function listMigrationNames(): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR);
  return files
    .filter((f) => f.endsWith(".up.sql"))
    .map((f) => f.replace(/\.up\.sql$/, ""))
    .sort();
}

async function getApplied(): Promise<string[]> {
  const rows = await sql.unsafe("SELECT name FROM schema_migrations ORDER BY id ASC");
  return rows.map((r: { name: string }) => r.name);
}

async function up() {
  await ensureMigrationsTable();
  const all = await listMigrationNames();
  const applied = new Set(await getApplied());
  const pending = all.filter((n) => !applied.has(n));

  if (pending.length === 0) {
    console.log("Nada para aplicar — schema já está em dia.");
    return;
  }

  for (const name of pending) {
    const content = await readFile(resolve(MIGRATIONS_DIR, `${name}.up.sql`), "utf8");
    console.log(`→ aplicando ${name}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx.unsafe("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    });
    console.log(`✓ ${name}`);
  }
}

async function down() {
  await ensureMigrationsTable();
  const applied = await getApplied();
  const last = applied.at(-1);

  if (!last) {
    console.log("Nada para reverter.");
    return;
  }

  const content = await readFile(resolve(MIGRATIONS_DIR, `${last}.down.sql`), "utf8");
  console.log(`→ revertendo ${last}`);
  await sql.begin(async (tx) => {
    await tx.unsafe(content);
    await tx.unsafe("DELETE FROM schema_migrations WHERE name = $1", [last]);
  });
  console.log(`✓ revertido ${last}`);
}

async function status() {
  await ensureMigrationsTable();
  const all = await listMigrationNames();
  const applied = new Set(await getApplied());
  if (all.length === 0) {
    console.log("Nenhuma migration encontrada em db/migrations.");
    return;
  }
  for (const name of all) {
    console.log(`${applied.has(name) ? "✓ aplicada " : "· pendente"} ${name}`);
  }
}

const cmd = process.argv[2];

try {
  if (cmd === "up") await up();
  else if (cmd === "down") await down();
  else if (cmd === "status") await status();
  else {
    console.error("Uso: bun run packages/db/src/migrate.ts <up|down|status>");
    process.exit(1);
  }
} finally {
  await sql.close();
}
