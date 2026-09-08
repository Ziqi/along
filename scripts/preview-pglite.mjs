#!/usr/bin/env node
/**
 * Give the built output's embedded Postgres its binaries.
 *
 * Nitro rolls `@electric-sql/pglite` into `_libs/electric-sql__pglite.mjs` but
 * does not carry `pglite.wasm` / `pglite.data` / `initdb.wasm` along, and the
 * module looks for them beside itself — so `vite preview` without DATABASE_URL
 * died on boot. Deployed builds run on Neon and never load PGLite, so this is
 * preview-only: `npm run preview` copies the files in when they are missing,
 * and nothing is added to the bundle that ships.
 */
import { copyFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "node_modules/@electric-sql/pglite/dist");
const DEST = join(ROOT, ".vercel/output/functions/__server.func/_libs");
const FILES = ["pglite.wasm", "pglite.data", "initdb.wasm"];

if (!existsSync(DEST) || !existsSync(join(DEST, "electric-sql__pglite.mjs"))) {
  // No PGLite in this build (Neon-only, or not built yet): nothing to place.
  process.exit(0);
}

for (const name of FILES) {
  const from = join(SRC, name);
  const to = join(DEST, name);
  if (!existsSync(from)) {
    console.error(`[preview] missing ${from} — is @electric-sql/pglite installed?`);
    process.exit(1);
  }
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  copyFileSync(from, to);
  console.log(`[preview] placed ${name} beside the bundled PGLite`);
}
