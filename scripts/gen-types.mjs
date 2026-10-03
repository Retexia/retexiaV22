// Generates packages/supabase/src/database.types.ts from the migrations, in the
// same format as `supabase gen types typescript`, without a running Supabase:
// the migrations run in PGlite and the schema is read from pg_catalog.
//
//   pnpm db:types
//
// With a local Supabase you can also use `pnpm db:types:supabase`.
import { writeFileSync } from "node:fs";
import { createHarness, migration } from "./lib/harness.mjs";

const { db } = await createHarness();
await db.exec(migration);
const q = async (sql) => (await db.query(sql)).rows;

const tsType = (t) => {
  if (t.endsWith("[]")) return `${tsType(t.slice(0, -2))}[]`;
  if (/^(smallint|integer|bigint|numeric|real|double precision)/.test(t)) return "number";
  if (t === "boolean") return "boolean";
  if (t === "jsonb" || t === "json") return "Json";
  return "string";
};

const columns = await q(`
  select c.relname as rel, c.relkind as kind, a.attname as name, format_type(a.atttypid, a.atttypmod) as type,
         a.attnotnull as notnull, (a.atthasdef or a.attidentity <> '' or a.attgenerated <> '') as hasdef
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v') and a.attnum > 0 and not a.attisdropped
   order by c.relname, a.attname`);

const fks = await q(`
  select k.conname as name, c.relname as rel, array_agg(a.attname order by x.n)::text[] as cols,
         p.relname as ref, array_agg(pa.attname order by x.n)::text[] as refcols
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    join pg_class p on p.oid = k.confrelid
    join pg_namespace pn on pn.oid = p.relnamespace and pn.nspname = 'public'
    cross join lateral unnest(k.conkey, k.confkey) with ordinality as x(col, refcol, n)
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = x.col
    join pg_attribute pa on pa.attrelid = k.confrelid and pa.attnum = x.refcol
   where k.contype = 'f'
   group by k.conname, c.relname, p.relname
   order by k.conname`);

const views = await q(`select viewname as name, definition from pg_views where schemaname = 'public'`);
const viewBase = Object.fromEntries(
  views.map((v) => [v.name, (/from\s+(?:public\.)?(\w+)/i.exec(v.definition) ?? [])[1]]),
);

const functions = await q(`
  select p.proname as name, pg_get_function_identity_arguments(p.oid) as args, p.pronargdefaults as ndefaults,
         p.proargnames as argnames, format_type(p.prorettype, null) as returns,
         coalesce(array(select format_type(t, null) from unnest(p.proargtypes) t), '{}') as argtypes
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and format_type(p.prorettype, null) <> 'trigger'
     and p.proname not like '\\_%'
   order by p.proname`);

const byRel = new Map();
for (const c of columns) {
  if (!byRel.has(c.rel)) byRel.set(c.rel, { kind: c.kind, cols: [] });
  byRel.get(c.rel).cols.push(c);
}

const lines = [];
const rels = (fkList) =>
  fkList.length
    ? ["        Relationships: [", ...fkList.flatMap((f) => [
        "          {",
        `            foreignKeyName: "${f.name}"`,
        `            columns: [${f.cols.map((c) => `"${c}"`).join(", ")}]`,
        "            isOneToOne: false",
        `            referencedRelation: "${f.ref}"`,
        `            referencedColumns: [${f.refcols.map((c) => `"${c}"`).join(", ")}]`,
        "          },",
      ]), "        ]"]
    : ["        Relationships: []"];

const section = (kind) => {
  for (const [rel, { kind: k, cols }] of [...byRel.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (k !== kind) continue;
    const isView = kind === "v";
    lines.push(`      ${rel}: {`);
    lines.push("        Row: {");
    for (const c of cols) lines.push(`          ${c.name}: ${tsType(c.type)}${!c.notnull || isView ? " | null" : ""}`);
    lines.push("        }");
    if (!isView) {
      lines.push("        Insert: {");
      for (const c of cols) lines.push(`          ${c.name}${!c.notnull || c.hasdef ? "?" : ""}: ${tsType(c.type)}${!c.notnull ? " | null" : ""}`);
      lines.push("        }");
      lines.push("        Update: {");
      for (const c of cols) lines.push(`          ${c.name}?: ${tsType(c.type)}${!c.notnull ? " | null" : ""}`);
      lines.push("        }");
      lines.push(...rels(fks.filter((f) => f.rel === rel)));
    } else {
      const base = viewBase[rel];
      const names = new Set(cols.map((c) => c.name));
      lines.push(...rels(fks.filter((f) => f.rel === base && f.cols.every((c) => names.has(c))).map((f) => ({ ...f, name: `${f.name}_${rel}` }))));
    }
    lines.push("      }");
  }
};

const fnLines = [];
for (const f of functions) {
  const names = f.argnames ?? [];
  const types = f.argtypes;
  const firstOptional = types.length - f.ndefaults;
  const args = types.map((t, i) => `${names[i] ?? `arg${i}`}${i >= firstOptional ? "?" : ""}: ${tsType(t)}`);
  const ret = f.returns === "void" ? "undefined" : tsType(f.returns);
  fnLines.push(`      ${f.name}: { Args: ${args.length ? `{ ${args.join("; ")} }` : "never"}; Returns: ${ret} }`);
}

const out = [
  "// Database types for the Retexia Supabase schema.",
  "// Generated by scripts/gen-types.mjs from supabase/migrations. Do not edit by hand:",
  "//   pnpm db:types",
  "",
  "export type Json =",
  "  | string",
  "  | number",
  "  | boolean",
  "  | null",
  "  | { [key: string]: Json | undefined }",
  "  | Json[]",
  "",
  "export type Database = {",
  "  // Allows to automatically instantiate createClient with right options",
  "  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)",
  "  __InternalSupabase: {",
  '    PostgrestVersion: "13.0.5"',
  "  }",
  "  public: {",
  "    Tables: {",
];
section("r");
lines.forEach((l) => out.push(l));
lines.length = 0;
out.push("    }", "    Views: {");
section("v");
lines.forEach((l) => out.push(l));
out.push("    }", "    Functions: {", ...fnLines, "    }", "    Enums: {", "      [_ in never]: never", "    }", "    CompositeTypes: {", "      [_ in never]: never", "    }", "  }", "}", "");
out.push("type DatabaseWithoutInternals = Omit<Database, \"__InternalSupabase\">\n\ntype DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, \"public\">]\n\nexport type Tables<\n  DefaultSchemaTableNameOrOptions extends\n    | keyof (DefaultSchema[\"Tables\"] & DefaultSchema[\"Views\"])\n    | { schema: keyof DatabaseWithoutInternals },\n  TableName extends DefaultSchemaTableNameOrOptions extends {\n    schema: keyof DatabaseWithoutInternals\n  }\n    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions[\"schema\"]][\"Tables\"] &\n        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions[\"schema\"]][\"Views\"])\n    : never = never,\n> = DefaultSchemaTableNameOrOptions extends {\n  schema: keyof DatabaseWithoutInternals\n}\n  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions[\"schema\"]][\"Tables\"] &\n      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions[\"schema\"]][\"Views\"])[TableName] extends {\n      Row: infer R\n    }\n    ? R\n    : never\n  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema[\"Tables\"] & DefaultSchema[\"Views\"])\n    ? (DefaultSchema[\"Tables\"] & DefaultSchema[\"Views\"])[DefaultSchemaTableNameOrOptions] extends {\n        Row: infer R\n      }\n      ? R\n      : never\n    : never\n\nexport type TablesInsert<\n  DefaultSchemaTableNameOrOptions extends\n    | keyof DefaultSchema[\"Tables\"]\n    | { schema: keyof DatabaseWithoutInternals },\n  TableName extends DefaultSchemaTableNameOrOptions extends {\n    schema: keyof DatabaseWithoutInternals\n  }\n    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions[\"schema\"]][\"Tables\"]\n    : never = never,\n> = DefaultSchemaTableNameOrOptions extends {\n  schema: keyof DatabaseWithoutInternals\n}\n  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions[\"schema\"]][\"Tables\"][TableName] extends {\n      Insert: infer I\n    }\n    ? I\n    : never\n  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema[\"Tables\"]\n    ? DefaultSchema[\"Tables\"][DefaultSchemaTableNameOrOptions] extends {\n        Insert: infer I\n      }\n      ? I\n      : never\n    : never\n\nexport type TablesUpdate<\n  DefaultSchemaTableNameOrOptions extends\n    | keyof DefaultSchema[\"Tables\"]\n    | { schema: keyof DatabaseWithoutInternals },\n  TableName extends DefaultSchemaTableNameOrOptions extends {\n    schema: keyof DatabaseWithoutInternals\n  }\n    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions[\"schema\"]][\"Tables\"]\n    : never = never,\n> = DefaultSchemaTableNameOrOptions extends {\n  schema: keyof DatabaseWithoutInternals\n}\n  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions[\"schema\"]][\"Tables\"][TableName] extends {\n      Update: infer U\n    }\n    ? U\n    : never\n  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema[\"Tables\"]\n    ? DefaultSchema[\"Tables\"][DefaultSchemaTableNameOrOptions] extends {\n        Update: infer U\n      }\n      ? U\n      : never\n    : never\n\nexport const Constants = {\n  public: {\n    Enums: {},\n  },\n} as const\n");

writeFileSync(new URL("../packages/supabase/src/database.types.ts", import.meta.url), out.join("\n"));
console.log(`database.types.ts: ${[...byRel.values()].filter((r) => r.kind === "r").length} tables, ${views.length} views, ${functions.length} functions`);
