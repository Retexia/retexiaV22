// Shared PGlite harness: an in-memory Postgres that looks like Supabase
// (auth/storage schemas, anon/authenticated/service_role roles, JWT claims),
// with the project's migrations, seed and new-product template loaded.
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../", import.meta.url);
const migrationsDir = new URL("supabase/migrations/", root);
export const migration = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(new URL(f, migrationsDir), "utf8"))
  .join("\n");
export const seed = readFileSync(new URL("supabase/seed.sql", root), "utf8");
export const template = readFileSync(new URL("supabase/templates/new_product.sql", root), "utf8");

export async function createHarness() {
  const db = new PGlite();

  // --- Supabase look-alike ------------------------------------------------------
  await db.exec(`
    create role anon nologin noinherit;
    create role authenticated nologin noinherit;
    create role service_role nologin noinherit bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    -- No default privileges: like newer Supabase projects, the migrations must grant access explicitly.
    alter default privileges in schema public revoke execute on functions from public;

    create schema auth;
    grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text,
      encrypted_password text,
      new_email text,
      raw_user_meta_data jsonb default '{}'::jsonb,
      last_sign_in_at timestamptz,
      email_confirmed_at timestamptz,
      banned_until timestamptz,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create table auth.mfa_factors (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references auth.users (id) on delete cascade,
      friendly_name text,
      factor_type text default 'totp',
      status text,
      secret text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(
        coalesce(
          nullif(current_setting('request.jwt.claim.sub', true), ''),
          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
        ), ''
      )::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    $$;
    grant execute on all functions in schema auth to anon, authenticated, service_role;

    create schema storage;
    grant usage on schema storage to anon, authenticated, service_role;
    create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
    $$;
    alter table storage.objects enable row level security;
  `);

  let failures = 0;
  let passes = 0;
  function ok(cond, label) {
    if (cond) {
      passes++;
      console.log(`  ✓ ${label}`);
    } else {
      failures++;
      console.log(`  ✗ ${label}`);
    }
  }
  async function expectError(fn, label, match) {
    try {
      await fn();
      ok(false, `${label} (no error raised)`);
    } catch (error) {
      const message = String(error?.message ?? error);
      ok(!match || match.test(message), `${label} → ${message}`);
    }
  }

  // Run a query as an API role inside a transaction, like PostgREST does.
  async function as(role, userId, sql, params = []) {
    return db.transaction(async (tx) => {
      const claims = JSON.stringify(userId ? { sub: userId, role } : { role });
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
      await tx.exec(`set local role ${role}`);
      return tx.query(sql, params);
    });
  }

  return {
    db,
    ok,
    expectError,
    as,
    summary() {
      console.log(`\n${passes} passed, ${failures} failed`);
      process.exit(failures ? 1 : 0);
    },
  };
}
