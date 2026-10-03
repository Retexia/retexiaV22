// Local Supabase stand-in for end-to-end tests. NOT for production.
//
// Real Postgres (PGlite) with the project's migrations and seed, the same
// roles, grants and RLS as Supabase, plus the parts of the PostgREST, GoTrue
// (incl. TOTP MFA and the admin API) and Storage APIs the apps use.
//
//   node scripts/e2e/mock-supabase.mjs        → http://localhost:54321
//
// Keys are written to scripts/e2e/.mock/keys.json; emails to .mock/outbox.log.
// POST /__test/sql { sql, params } runs SQL as the database owner (setup only).
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import { createHarness, migration, seed } from "../lib/harness.mjs";

const PORT = Number(process.env.MOCK_SUPABASE_PORT ?? 54321);
const SECRET = "e2e-only-jwt-secret-e2e-only-jwt-secret";
const STATE = new URL("./.mock/", import.meta.url);
mkdirSync(STATE, { recursive: true });
const OUTBOX = new URL("outbox.log", STATE);
writeFileSync(OUTBOX, "");

/* ------------------------------------------------------------------ jwt --- */
const b64u = (buf) => Buffer.from(buf).toString("base64url");
function sign(payload) {
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(payload));
  return `${head}.${body}.${createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url")}`;
}
function verify(token) {
  if (!token) return null;
  const [h, b, s] = token.split(".");
  if (!h || !b || !s) return null;
  if (createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url") !== s) return null;
  const payload = JSON.parse(Buffer.from(b, "base64url").toString());
  if (payload.exp && payload.exp < Date.now() / 1000) return null;
  return payload;
}
const ANON_KEY = sign({ role: "anon", iss: "supabase-e2e", iat: 1700000000, exp: 2000000000 });
const SERVICE_KEY = sign({ role: "service_role", iss: "supabase-e2e", iat: 1700000000, exp: 2000000000 });
writeFileSync(new URL("keys.json", STATE), JSON.stringify({ url: `http://localhost:${PORT}`, anon: ANON_KEY, service: SERVICE_KEY }, null, 2));

/* ------------------------------------------------------------- database --- */
const { db } = await createHarness();
await db.exec(migration);
await db.exec(seed);
console.log("[db] migrations + seed applied");

let chain = Promise.resolve();
const serial = (fn) => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
};

function httpError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}
const pgStatus = (code) =>
  ({ "42501": 403, "23505": 409, "23503": 409, "23514": 400, "22023": 400, P0001: 400, P0002: 404, "22P02": 400, "42703": 400, "42883": 404 })[code] ?? 400;
const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw httpError(400, "PGRST100", `bad identifier ${s}`);
  return `"${s}"`;
};

// Foreign keys between public tables (embedding) and the columns of views.
const fks = (
  await db.query(`
  select c.relname as child, a.attname as child_col, p.relname as parent, pa.attname as parent_col, k.conname as name
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    join pg_class p on p.oid = k.confrelid join pg_namespace pn on pn.oid = p.relnamespace and pn.nspname = 'public'
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    join pg_attribute pa on pa.attrelid = k.confrelid and pa.attnum = k.confkey[1]
   where k.contype = 'f'`)
).rows;

/* ------------------------------------------------------------ PostgREST --- */

/** "a,b,rel(c,d),alias:rel!inner(*)" → tree */
function parseSelect(str) {
  const s = (str ?? "*").replace(/\s+/g, "");
  let i = 0;
  function list() {
    const out = [];
    let token = "";
    while (i < s.length) {
      const ch = s[i];
      if (ch === "(") {
        i++;
        out.push({ embed: token, children: list() });
        token = "";
        if (s[i] === ",") i++;
        continue;
      }
      if (ch === ")") {
        i++;
        if (token) out.push({ col: token });
        return out;
      }
      if (ch === ",") {
        if (token) out.push({ col: token });
        token = "";
        i++;
        continue;
      }
      token += ch;
      i++;
    }
    if (token) out.push({ col: token });
    return out;
  }
  return list();
}

let aliasN = 0;
const OPS = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "ilike" };

function unquote(v) {
  return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\"/g, '"') : v;
}

/** One PostgREST condition "col=op.value" → SQL. */
function condition(alias, column, raw, values) {
  const [colPath, cast] = column.split("::");
  const col = `${alias}.${ident(colPath)}${cast ? `::${ident(cast).replace(/"/g, "")}` : ""}`;
  let rest = raw;
  let not = false;
  if (rest.startsWith("not.")) {
    not = true;
    rest = rest.slice(4);
  }
  const dot = rest.indexOf(".");
  const op = rest.slice(0, dot);
  const val = rest.slice(dot + 1);
  let cond;
  if (OPS[op]) {
    values.push(op === "like" || op === "ilike" ? unquote(val).replace(/\*/g, "%") : unquote(val));
    cond = `${col} ${OPS[op]} $${values.length}`;
  } else if (op === "is") {
    cond = `${col} is ${val === "null" ? "null" : val === "true" ? "true" : "false"}`;
  } else if (op === "in") {
    const items = val.replace(/^\(|\)$/g, "").split(",").filter((v) => v !== "").map(unquote);
    if (!items.length) cond = "false";
    else cond = `${col} in (${items.map((v) => (values.push(v), `$${values.length}`)).join(",")})`;
  } else if (op === "cs" || op === "cd" || op === "ov") {
    const items = val.replace(/^\{|\}$/g, "").split(",").filter(Boolean).map(unquote);
    values.push(items);
    cond = `${col} ${op === "cs" ? "@>" : op === "cd" ? "<@" : "&&"} $${values.length}`;
  } else throw httpError(400, "PGRST100", `unsupported operator ${op}`);
  return not ? `not (${cond})` : cond;
}

/** "or=(a.eq.1,b.ilike.*x*,and(c.eq.2,d.eq.3))" → SQL */
function logic(alias, kind, raw, values) {
  const inner = raw.replace(/^\(/, "").replace(/\)$/, "");
  const parts = [];
  let depth = 0;
  let quoted = false;
  let token = "";
  for (const ch of inner) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth--;
    if (!quoted && depth === 0 && ch === ",") {
      parts.push(token);
      token = "";
      continue;
    }
    token += ch;
  }
  if (token) parts.push(token);
  const conds = parts.map((p) => {
    const m = p.match(/^(and|or)\((.*)\)$/);
    if (m) return logic(alias, m[1], `(${m[2]})`, values);
    const dot = p.indexOf(".");
    return condition(alias, p.slice(0, dot), p.slice(dot + 1), values);
  });
  return `(${conds.join(kind === "or" ? " or " : " and ")})`;
}

function rowExpr(table, alias, items, embedFilters, values) {
  const parts = [];
  const inner = [];
  let star = false;
  for (const it of items) {
    if (it.col !== undefined) {
      if (it.col === "*") {
        star = true;
        continue;
      }
      const [name, colRaw] = it.col.includes(":") ? it.col.split(":") : [it.col, it.col];
      const col = colRaw.split("::")[0];
      parts.push(`'${name}', ${alias}.${ident(col)}`);
      continue;
    }
    const [name, relRaw] = it.embed.includes(":") ? it.embed.split(":") : [it.embed, it.embed];
    const [relTable, ...hints] = relRaw.split("!");
    const isInner = hints.includes("inner");
    const fkHint = hints.find((h) => h !== "inner" && h !== "left");
    const sub = `t${++aliasN}`;
    const match = (f) => !fkHint || f.name === fkHint || f.child_col === fkHint;
    const toOne = fks.find((f) => f.child === table && f.parent === relTable && match(f));
    const toMany = fks.find((f) => f.child === relTable && f.parent === table && match(f));
    const filters = (embedFilters.get(name) ?? embedFilters.get(relTable) ?? []).map(([c, raw]) => condition(sub, c, raw, values));
    const link = toOne
      ? `${sub}.${ident(toOne.parent_col)} = ${alias}.${ident(toOne.child_col)}`
      : toMany
        ? `${sub}.${ident(toMany.child_col)} = ${alias}.${ident(toMany.parent_col)}`
        : null;
    if (!link) throw httpError(400, "PGRST200", `Could not find a relationship between '${table}' and '${relTable}'`);
    const where = [link, ...filters].join(" and ");
    const childExpr = rowExpr(relTable, sub, it.children, new Map(), values);
    parts.push(
      toOne
        ? `'${name}', (select ${childExpr.expr} from public.${ident(relTable)} ${sub} where ${where})`
        : `'${name}', coalesce((select jsonb_agg(${childExpr.expr}) from public.${ident(relTable)} ${sub} where ${where}), '[]'::jsonb)`,
    );
    if (isInner || filters.length) {
      const s2 = `t${++aliasN}`;
      const where2 = where.replaceAll(`${sub}.`, `${s2}.`);
      if (isInner) inner.push(`exists (select 1 from public.${ident(relTable)} ${s2} where ${where2})`);
    }
  }
  const obj = parts.length ? `jsonb_build_object(${parts.join(", ")})` : `'{}'::jsonb`;
  return { expr: star ? `(to_jsonb(${alias}) || ${obj})` : obj, inner };
}

function orderBy(order, alias) {
  if (!order) return "";
  return (
    " order by " +
    order
      .split(",")
      .map((part) => {
        const [col, dir, nulls] = part.split(".");
        return `${alias}.${ident(col)} ${dir === "desc" ? "desc" : "asc"}${nulls === "nullsfirst" ? " nulls first" : nulls === "nullslast" ? " nulls last" : ""}`;
      })
      .join(", ")
  );
}

async function asRole(claims, headers, fn) {
  return serial(() =>
    db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true), set_config('request.headers', $2, true)`, [
        JSON.stringify(claims),
        JSON.stringify({ "x-forwarded-for": headers["x-forwarded-for"] ?? "127.0.0.1", "user-agent": headers["user-agent"] ?? "" }),
      ]);
      await tx.exec(`set local role ${claims.role === "authenticated" ? "authenticated" : claims.role === "service_role" ? "service_role" : "anon"}`);
      return fn(tx);
    }),
  );
}

const sqlValue = (v) => (v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : Array.isArray(v) && v.some((x) => x && typeof x === "object") ? JSON.stringify(v) : v);
const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns", "or", "and"]);

async function rest(req, url, body, claims) {
  const path = url.pathname.replace(/^\/rest\/v1\//, "");
  const accept = req.headers.accept ?? "";
  const prefer = req.headers.prefer ?? "";
  const single = accept.includes("vnd.pgrst.object");
  const wantCount = /count=(exact|planned|estimated)/.test(prefer);

  if (path.startsWith("rpc/")) {
    const fn = ident(path.slice(4));
    const args = Object.entries(req.method === "GET" ? Object.fromEntries(url.searchParams) : (body ?? {}));
    const values = args.map(([, v]) => sqlValue(v));
    const res = await asRole(claims, req.headers, (tx) => tx.query(`select public.${fn}(${args.map(([k], i) => `${ident(k)} => $${i + 1}`).join(", ")}) as r`, values));
    const r = res.rows[0]?.r ?? null;
    return { status: 200, body: r };
  }

  const table = path;
  ident(table);
  const alias = "t0";
  const values = [];
  const params = [...url.searchParams.entries()];
  const embedFilters = new Map();
  const where = [];
  for (const [key, raw] of params) {
    if (RESERVED.has(key) || key.endsWith(".order") || key.endsWith(".limit")) continue;
    if (key.includes(".")) {
      const [rel, col] = key.split(".");
      embedFilters.set(rel, [...(embedFilters.get(rel) ?? []), [col, raw]]);
      continue;
    }
    where.push(condition(alias, key, raw, values));
  }
  for (const [key, raw] of params) if (key === "or" || key === "and") where.push(logic(alias, key, raw, values));

  if (req.method === "GET" || req.method === "HEAD") {
    aliasN = 0;
    const { expr, inner } = rowExpr(table, alias, parseSelect(url.searchParams.get("select")), embedFilters, values);
    const allWhere = [...where, ...inner];
    const from = `from public.${ident(table)} ${alias}${allWhere.length ? ` where ${allWhere.join(" and ")}` : ""}`;
    let sql = `select ${expr} as j ${from}${orderBy(url.searchParams.get("order"), alias)}`;
    const limit = url.searchParams.get("limit");
    const offset = Number(url.searchParams.get("offset") ?? 0);
    if (limit) sql += ` limit ${Number(limit)}`;
    if (offset) sql += ` offset ${offset}`;
    const { rows, total } = await asRole(claims, req.headers, async (tx) => {
      const res = req.method === "HEAD" ? { rows: [] } : await tx.query(sql, values);
      const count = wantCount ? Number((await tx.query(`select count(*)::int as n ${from}`, values)).rows[0].n) : null;
      return { rows: res.rows.map((r) => r.j), total: count };
    });
    const headers = {};
    if (wantCount) headers["content-range"] = rows.length ? `${offset}-${offset + rows.length - 1}/${total}` : `*/${total}`;
    if (single) {
      if (rows.length !== 1) throw httpError(406, "PGRST116", "JSON object requested, multiple (or no) rows returned");
      return { status: 200, body: rows[0], headers };
    }
    return { status: req.method === "HEAD" ? 200 : 200, body: req.method === "HEAD" ? null : rows, headers };
  }

  const returning = prefer.includes("return=representation");
  const select = url.searchParams.get("select") ?? "*";
  const retCols = select === "*" ? "*" : parseSelect(select).filter((i) => i.col).map((i) => ident(i.col.split(":").pop())).join(", ");

  if (req.method === "POST") {
    const rows = Array.isArray(body) ? body : [body];
    const onConflict = url.searchParams.get("on_conflict");
    const merge = prefer.includes("resolution=merge-duplicates");
    const ignore = prefer.includes("resolution=ignore-duplicates");
    const out = await asRole(claims, req.headers, async (tx) => {
      const acc = [];
      for (const row of rows) {
        const cols = Object.keys(row);
        const vals = cols.map((c) => sqlValue(row[c]));
        let sql = `insert into public.${ident(table)} (${cols.map(ident).join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`;
        if (merge || ignore) {
          const target = onConflict ? `(${onConflict.split(",").map(ident).join(", ")})` : "";
          const updates = cols.filter((c) => !(onConflict ?? "id").split(",").includes(c)).map((c) => `${ident(c)} = excluded.${ident(c)}`);
          sql += ignore || !updates.length ? ` on conflict ${target} do nothing` : ` on conflict ${target} do update set ${updates.join(", ")}`;
        }
        if (returning) sql += ` returning ${retCols}`;
        const res = await tx.query(sql, vals);
        acc.push(...res.rows);
      }
      return acc;
    });
    if (!returning) return { status: 201, body: null };
    return { status: 201, body: single ? (out[0] ?? null) : out };
  }

  if (req.method === "PATCH") {
    const cols = Object.keys(body ?? {});
    const setVals = cols.map((c) => sqlValue(body[c]));
    // Filters were numbered first; renumber the SET placeholders after them.
    const sets = cols.map((c, i) => `${ident(c)} = $${values.length + i + 1}`).join(", ");
    const sql = `update public.${ident(table)} ${alias} set ${sets}${where.length ? ` where ${where.join(" and ")}` : ""}${returning ? ` returning ${retCols}` : ""}`;
    const res = await asRole(claims, req.headers, (tx) => tx.query(sql, [...values, ...setVals]));
    if (!returning) return { status: 204, body: null };
    return { status: 200, body: single ? (res.rows[0] ?? null) : res.rows };
  }

  if (req.method === "DELETE") {
    const sql = `delete from public.${ident(table)} ${alias}${where.length ? ` where ${where.join(" and ")}` : ""}${returning ? ` returning ${retCols}` : ""}`;
    const res = await asRole(claims, req.headers, (tx) => tx.query(sql, values));
    if (!returning) return { status: 204, body: null };
    return { status: 200, body: single ? (res.rows[0] ?? null) : res.rows };
  }
  throw httpError(405, "PGRST", "method not allowed");
}

/* --------------------------------------------------------------- GoTrue --- */
const refreshTokens = new Map(); // token → { userId, aal, sessionId }
const emailTokens = new Map(); // token_hash → { userId, type }
const challenges = new Map(); // id → { factorId, expires }
const hash = (p) => createHash("sha256").update(`salt:${p}`).digest("hex");
const q1 = async (sql, params) => (await serial(() => db.query(sql, params))).rows[0];

// TOTP (RFC 6238): 6 digits, 30 seconds, SHA-1, base32 secrets.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(buf) {
  let bits = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  return bits.match(/.{1,5}/g).map((c) => B32[parseInt(c.padEnd(5, "0"), 2)]).join("");
}
function unbase32(s) {
  const bits = s.replace(/=+$/, "").toUpperCase().split("").map((c) => B32.indexOf(c).toString(2).padStart(5, "0")).join("");
  return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
}
export function totp(secret, at = Date.now(), step = 0) {
  const counter = Math.floor(at / 1000 / 30) + step;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", unbase32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}

async function factorsOf(userId) {
  return (await serial(() => db.query(`select id, friendly_name, factor_type, status, created_at, updated_at from auth.mfa_factors where user_id = $1 order by created_at`, [userId]))).rows;
}
async function userJson(u) {
  const factors = await factorsOf(u.id);
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    new_email: u.new_email ?? undefined,
    email_confirmed_at: u.email_confirmed_at,
    confirmed_at: u.email_confirmed_at,
    last_sign_in_at: u.last_sign_in_at,
    banned_until: u.banned_until,
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: u.raw_user_meta_data ?? {},
    identities: [{ id: u.id, user_id: u.id, provider: "email", identity_data: { sub: u.id, email: u.email } }],
    factors: factors.map((f) => ({ ...f, factor_type: f.factor_type ?? "totp" })),
    created_at: u.created_at,
    updated_at: u.updated_at,
    is_anonymous: false,
  };
}
async function session(u, aal = "aal1", methods = ["password"], sessionId = randomUUID()) {
  const now = Math.floor(Date.now() / 1000);
  const access = sign({
    sub: u.id,
    role: "authenticated",
    aud: "authenticated",
    email: u.email,
    iat: now,
    exp: now + 3600,
    aal,
    amr: methods.map((method) => ({ method, timestamp: now })),
    session_id: sessionId,
    user_metadata: u.raw_user_meta_data ?? {},
    app_metadata: { provider: "email" },
    is_anonymous: false,
  });
  const refresh = randomBytes(16).toString("hex");
  refreshTokens.set(refresh, { userId: u.id, aal, sessionId, methods });
  return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: refresh, user: await userJson(u) };
}
function sendEmail(type, email, userId, redirectTo) {
  const tokenHash = randomBytes(12).toString("hex");
  emailTokens.set(tokenHash, { userId, type });
  let link;
  try {
    const u = new URL(redirectTo);
    const confirm = new URL("/auth/confirm", u.origin);
    confirm.searchParams.set("token_hash", tokenHash);
    confirm.searchParams.set("type", type);
    confirm.searchParams.set("next", u.searchParams.get("next") ?? "/");
    link = confirm.toString();
  } catch {
    link = `token_hash=${tokenHash}&type=${type}`;
  }
  appendFileSync(OUTBOX, `${JSON.stringify({ at: new Date().toISOString(), type, email, link })}\n`);
}
const authErr = (status, code, msg) => ({ status, body: { code, error_code: code, msg, message: msg } });
const getUser = (id) => q1(`select * from auth.users where id = $1`, [id]);
const getUserByEmail = (email) => q1(`select * from auth.users where email = lower($1)`, [email]);

async function auth(req, url, body, claims) {
  const path = url.pathname.replace(/^\/auth\/v1/, "");
  const method = req.method;
  if (path === "/.well-known/jwks.json") return { status: 200, body: { keys: [] } };
  if (path === "/settings") return { status: 200, body: { external: { email: true, google: false }, mailer_autoconfirm: false } };

  if (path === "/signup" && method === "POST") {
    const email = String(body.email ?? "").toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return authErr(400, "validation_failed", "invalid email");
    if (String(body.password ?? "").length < 8) return authErr(422, "weak_password", "weak password");
    if (await getUserByEmail(email)) return { status: 200, body: { ...(await userJson(await getUserByEmail(email))), identities: [] } };
    const u = await q1(`insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, $2, $3) returning *`, [email, hash(body.password), JSON.stringify(body.data ?? {})]);
    sendEmail("signup", email, u.id, url.searchParams.get("redirect_to"));
    return { status: 200, body: await userJson(u) };
  }

  if (path === "/token" && method === "POST") {
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      const u = await getUserByEmail(String(body.email ?? ""));
      if (!u || !u.encrypted_password || u.encrypted_password !== hash(body.password)) return authErr(400, "invalid_credentials", "Invalid login credentials");
      if (!u.email_confirmed_at) return authErr(400, "email_not_confirmed", "Email not confirmed");
      if (u.banned_until && new Date(u.banned_until) > new Date()) return authErr(400, "user_banned", "User is banned");
      await q1(`update auth.users set last_sign_in_at = now() where id = $1 returning id`, [u.id]);
      return { status: 200, body: await session(await getUser(u.id)) };
    }
    if (grant === "refresh_token") {
      const rt = refreshTokens.get(body.refresh_token);
      if (!rt) return authErr(400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
      refreshTokens.delete(body.refresh_token);
      const u = await getUser(rt.userId);
      if (!u) return authErr(400, "user_not_found", "User not found");
      return { status: 200, body: await session(u, rt.aal, rt.methods, rt.sessionId) };
    }
    return authErr(400, "unsupported_grant_type", "unsupported");
  }

  if (path === "/verify" && method === "POST") {
    const tk = emailTokens.get(body.token_hash);
    if (!tk) return authErr(403, "otp_expired", "Email link is invalid or has expired");
    emailTokens.delete(body.token_hash);
    if (["signup", "email", "magiclink", "invite", "recovery"].includes(tk.type)) {
      await q1(`update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()), last_sign_in_at = now() where id = $1 returning id`, [tk.userId]);
    }
    if (tk.type === "email_change") await q1(`update auth.users set email = new_email, new_email = null where id = $1 returning id`, [tk.userId]);
    return { status: 200, body: await session(await getUser(tk.userId), "aal1", ["otp"]) };
  }

  if (path === "/otp" && method === "POST") {
    const u = await getUserByEmail(String(body.email ?? ""));
    if (u) sendEmail("magiclink", u.email, u.id, url.searchParams.get("redirect_to") ?? body.options?.email_redirect_to);
    return { status: 200, body: {} };
  }

  if (path === "/recover" && method === "POST") {
    const u = await getUserByEmail(String(body.email ?? ""));
    if (u) sendEmail("recovery", u.email, u.id, url.searchParams.get("redirect_to"));
    return { status: 200, body: {} };
  }

  if (path === "/logout" && method === "POST") {
    if (claims?.sub && url.searchParams.get("scope") !== "local") for (const [tok, v] of refreshTokens) if (v.userId === claims.sub) refreshTokens.delete(tok);
    return { status: 204, body: null };
  }

  // --- Admin API (service role) ---
  if (path === "/invite" || path.startsWith("/admin/")) {
    if (claims?.role !== "service_role") return authErr(403, "not_admin", "User not allowed");
    if (path === "/invite" && method === "POST") {
      const email = String(body.email ?? "").toLowerCase();
      if (await getUserByEmail(email)) return authErr(422, "email_exists", "A user with this email address has already been registered");
      const u = await q1(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning *`, [email, JSON.stringify(body.data ?? {})]);
      sendEmail("invite", email, u.id, url.searchParams.get("redirect_to"));
      return { status: 200, body: await userJson(u) };
    }
    const fa = path.match(/^\/admin\/users\/([0-9a-f-]{36})\/factors(?:\/([0-9a-f-]{36}))?$/);
    if (fa && method === "GET") return { status: 200, body: await factorsOf(fa[1]) };
    if (fa && method === "DELETE" && fa[2]) {
      await serial(() => db.query(`delete from auth.mfa_factors where id = $1 and user_id = $2`, [fa[2], fa[1]]));
      return { status: 200, body: { id: fa[2] } };
    }
    const m = path.match(/^\/admin\/users\/([0-9a-f-]{36})$/);
    if (m) {
      const u = await getUser(m[1]);
      if (!u) return authErr(404, "user_not_found", "User not found");
      if (method === "GET") return { status: 200, body: await userJson(u) };
      if (method === "DELETE") {
        await serial(() => db.query(`delete from auth.users where id = $1`, [u.id]));
        return { status: 200, body: {} };
      }
      if (method === "PUT") {
        if (body.ban_duration) {
          const until = body.ban_duration === "none" ? null : new Date(Date.now() + 876000 * 3600_000).toISOString();
          await q1(`update auth.users set banned_until = $2 where id = $1 returning id`, [u.id, until]);
          if (until) for (const [tok, v] of refreshTokens) if (v.userId === u.id) refreshTokens.delete(tok);
        }
        if (body.email) await q1(`update auth.users set email = lower($2), email_confirmed_at = case when $3 then now() else email_confirmed_at end where id = $1 returning id`, [u.id, body.email, Boolean(body.email_confirm)]);
        if (body.password) await q1(`update auth.users set encrypted_password = $2 where id = $1 returning id`, [u.id, hash(body.password)]);
        if (body.user_metadata) await q1(`update auth.users set raw_user_meta_data = raw_user_meta_data || $2::jsonb where id = $1 returning id`, [u.id, JSON.stringify(body.user_metadata)]);
        return { status: 200, body: await userJson(await getUser(u.id)) };
      }
    }
    return authErr(404, "not_found", `mock: ${method} ${path} not implemented`);
  }

  // --- Signed-in user ---
  if (!claims?.sub) return authErr(401, "no_authorization", "This endpoint requires a valid Bearer token");
  const u = await getUser(claims.sub);
  if (!u) return authErr(403, "user_not_found", "User from sub claim in JWT does not exist");

  if (path === "/user") {
    if (method === "PUT") {
      if (body.password) {
        if (u.encrypted_password === hash(body.password)) return authErr(422, "same_password", "New password should be different from the old password.");
        await q1(`update auth.users set encrypted_password = $2 where id = $1 returning id`, [u.id, hash(body.password)]);
      }
      if (body.data) await q1(`update auth.users set raw_user_meta_data = raw_user_meta_data || $2::jsonb where id = $1 returning id`, [u.id, JSON.stringify(body.data)]);
      if (body.email && body.email.toLowerCase() !== u.email) {
        if (await getUserByEmail(body.email)) return authErr(422, "email_exists", "email exists");
        await q1(`update auth.users set new_email = lower($2) where id = $1 returning id`, [u.id, body.email]);
        sendEmail("email_change", body.email.toLowerCase(), u.id, url.searchParams.get("redirect_to"));
      }
    }
    return { status: 200, body: await userJson(await getUser(u.id)) };
  }

  if (path === "/factors" && method === "POST") {
    const name = body.friendly_name ?? null;
    if (name && (await q1(`select 1 as x from auth.mfa_factors where user_id = $1 and friendly_name = $2`, [u.id, name]))) {
      return authErr(422, "mfa_factor_name_conflict", `A factor with the friendly name "${name}" for this user already exists`);
    }
    const secret = base32(randomBytes(20));
    const f = await q1(`insert into auth.mfa_factors (user_id, friendly_name, factor_type, status, secret) values ($1, $2, 'totp', 'unverified', $3) returning id`, [u.id, name, secret]);
    const uri = `otpauth://totp/Retexia:${encodeURIComponent(u.email)}?secret=${secret}&issuer=Retexia`;
    const qr = `<svg xmlns="http://www.w3.org/2000/svg" width="176" height="176"><rect width="176" height="176" fill="#fff"/><text x="8" y="90" font-size="10">${secret}</text></svg>`;
    return { status: 200, body: { id: f.id, type: "totp", friendly_name: name, totp: { qr_code: qr, secret, uri } } };
  }
  const fm = path.match(/^\/factors\/([0-9a-f-]{36})(\/challenge|\/verify)?$/);
  if (fm) {
    const f = await q1(`select * from auth.mfa_factors where id = $1 and user_id = $2`, [fm[1], u.id]);
    if (!f) return authErr(404, "mfa_factor_not_found", "Factor not found");
    if (!fm[2] && method === "DELETE") {
      if (f.status === "verified" && claims.aal !== "aal2") return authErr(403, "insufficient_aal", "AAL2 required to unenroll verified factor");
      await serial(() => db.query(`delete from auth.mfa_factors where id = $1`, [f.id]));
      return { status: 200, body: { id: f.id } };
    }
    if (fm[2] === "/challenge" && method === "POST") {
      const id = randomUUID();
      challenges.set(id, { factorId: f.id, expires: Date.now() + 300_000 });
      return { status: 200, body: { id, type: "totp", expires_at: Math.floor(Date.now() / 1000) + 300 } };
    }
    if (fm[2] === "/verify" && method === "POST") {
      const ch = challenges.get(body.challenge_id);
      if (!ch || ch.factorId !== f.id || ch.expires < Date.now()) return authErr(422, "mfa_challenge_expired", "Challenge expired");
      const code = String(body.code ?? "");
      if (![-1, 0, 1].some((s) => totp(f.secret, Date.now(), s) === code)) return authErr(422, "mfa_verification_failed", "Invalid TOTP code entered");
      challenges.delete(body.challenge_id);
      await q1(`update auth.mfa_factors set status = 'verified', updated_at = now() where id = $1 returning id`, [f.id]);
      return { status: 200, body: await session(await getUser(u.id), "aal2", ["password", "totp"], claims.session_id) };
    }
  }

  return authErr(404, "not_found", `mock: ${method} ${path} not implemented`);
}

/* -------------------------------------------------------------- Storage --- */
const files = new Map(); // `${bucket}/${path}` → { bytes, type }

async function storage(req, url, raw, claims) {
  const path = decodeURIComponent(url.pathname.replace(/^\/storage\/v1/, ""));
  const pub = path.match(/^\/object\/public\/([^/]+)\/(.+)$/);
  if (pub && req.method === "GET") {
    const bucket = await q1(`select * from storage.buckets where id = $1`, [pub[1]]);
    const f = files.get(`${pub[1]}/${pub[2]}`);
    if (!bucket?.public || !f) return { status: 404, body: { message: "Object not found" } };
    return { status: 200, raw: f.bytes, type: f.type };
  }
  const signedGet = path.match(/^\/object\/sign\/([^/]+)\/(.+)$/);
  if (signedGet && req.method === "GET") {
    const token = verify(url.searchParams.get("token"));
    const key = `${signedGet[1]}/${signedGet[2]}`;
    if (!token || token.url !== key) return { status: 400, body: { message: "Invalid signature" } };
    const f = files.get(key);
    return f ? { status: 200, raw: f.bytes, type: f.type } : { status: 404, body: { message: "Object not found" } };
  }
  if (signedGet && req.method === "POST") {
    const [bucket, name] = [signedGet[1], signedGet[2]];
    const visible = await asRole(claims, req.headers, (tx) => tx.query(`select 1 from storage.objects where bucket_id = $1 and name = $2`, [bucket, name]));
    if (!visible.rows.length) return { status: 400, body: { statusCode: "404", error: "not_found", message: "Object not found" } };
    const body = JSON.parse(raw.toString() || "{}");
    const token = sign({ url: `${bucket}/${name}`, exp: Math.floor(Date.now() / 1000) + Number(body.expiresIn ?? 60) });
    return { status: 200, body: { signedURL: `/object/sign/${bucket}/${encodeURI(name)}?token=${token}` } };
  }
  const obj = path.match(/^\/object\/([^/]+)\/(.+)$/);
  if (obj && (req.method === "POST" || req.method === "PUT")) {
    const [bucketId, name] = [obj[1], obj[2]];
    const bucket = await q1(`select * from storage.buckets where id = $1`, [bucketId]);
    if (!bucket) return { status: 400, body: { statusCode: "404", error: "Bucket not found", message: "Bucket not found" } };
    const type = String(req.headers["content-type"] ?? "application/octet-stream").split(";")[0];
    if (bucket.file_size_limit && raw.length > Number(bucket.file_size_limit)) return { status: 413, body: { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" } };
    if (bucket.allowed_mime_types?.length && !bucket.allowed_mime_types.includes(type)) return { status: 415, body: { statusCode: "415", error: "invalid_mime_type", message: `mime type ${type} is not supported` } };
    try {
      await asRole(claims, req.headers, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucketId, name]));
    } catch (e) {
      return { status: 400, body: { statusCode: "403", error: "Unauthorized", message: e.message.includes("row-level security") ? "new row violates row-level security policy" : e.message } };
    }
    files.set(`${bucketId}/${name}`, { bytes: raw, type });
    return { status: 200, body: { Key: `${bucketId}/${name}`, Id: randomUUID() } };
  }
  const del = path.match(/^\/object\/([^/]+)$/);
  if (del && req.method === "DELETE") {
    const { prefixes = [] } = JSON.parse(raw.toString() || "{}");
    const res = await asRole(claims, req.headers, (tx) => tx.query(`delete from storage.objects where bucket_id = $1 and name = any($2) returning name`, [del[1], prefixes]));
    for (const r of res.rows) files.delete(`${del[1]}/${r.name}`);
    return { status: 200, body: res.rows.map((r) => ({ name: r.name, bucket_id: del[1] })) };
  }
  return { status: 404, body: { message: `mock storage: ${req.method} ${path}` } };
}

/* --------------------------------------------------------------- server --- */
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info, prefer, accept, accept-profile, content-profile, x-supabase-api-version, range, x-upsert, cache-control");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "content-range");
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);

  if (url.pathname === "/__test/sql" && req.method === "POST") {
    const { sql, params } = JSON.parse(raw.toString());
    try {
      const r = await serial(() => db.query(sql, params ?? []));
      return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(r.rows));
    } catch (e) {
      return res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: e.message }));
    }
  }
  if (url.pathname === "/__test/totp" && req.method === "POST") {
    const { secret } = JSON.parse(raw.toString());
    return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ code: totp(secret) }));
  }

  let body = null;
  if (!url.pathname.startsWith("/storage/")) {
    try {
      body = raw.length ? JSON.parse(raw.toString()) : null;
    } catch {
      body = null;
    }
  }
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const claims = verify(bearer) ?? verify(req.headers.apikey) ?? { role: "anon" };

  try {
    let out;
    if (url.pathname.startsWith("/rest/v1/")) out = await rest(req, url, body ?? {}, claims);
    else if (url.pathname.startsWith("/auth/v1/")) out = await auth(req, url, body ?? {}, claims);
    else if (url.pathname.startsWith("/storage/v1/")) out = await storage(req, url, raw, claims);
    else out = { status: 404, body: { message: "not found" } };
    if (out.raw) {
      res.writeHead(out.status, { "content-type": out.type, "cache-control": "no-store" });
      return res.end(out.raw);
    }
    res.writeHead(out.status, { "content-type": "application/json", ...(out.headers ?? {}) });
    res.end(out.body === null || out.status === 204 || req.method === "HEAD" ? undefined : JSON.stringify(out.body));
    if (process.env.VERBOSE) console.log(req.method, req.url, out.status);
  } catch (e) {
    const status = e.status ?? pgStatus(e.code);
    if (process.env.VERBOSE || status >= 500) console.log(`[err] ${req.method} ${req.url} → ${status} ${e.code ?? ""} ${e.message}`);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ code: e.code ?? "PGRST", message: e.message, details: null, hint: null }));
  }
});

server.listen(PORT, () => console.log(`[mock-supabase] ready on http://localhost:${PORT}`));
