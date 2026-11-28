import "server-only";

import { redirect } from "next/navigation";
import { getFeeder, requireFeederPage } from "../access";
import { mySetup } from "../data";
import { feederDb } from "../db";
import { lfDb } from "../lingo-feeder/db";
import { readTemplate, type TemplateData } from "./plan";
import { BUCKET } from "./runner";
import type { AccountRow, CreativeRow, EventRow, LaunchRow, NodeRow } from "./types";

export const AUTOPUBLISH_SLUG = "autopublish";

/** For Autopublish pages: signed in, and Autopublish is on the account (it's free, so everyone once 0036 has run). */
export async function requireAutopublishPage(path = "/autopublish") {
  const feeder = await requireFeederPage(path);
  const pkg = feeder.packages.find((p) => p.slug === AUTOPUBLISH_SLUG);
  if (!pkg?.owned) redirect("/");
  return feeder;
}

/** For server actions: the customer (or the customer a Retexia admin opened in support mode). */
export async function autopublishUser() {
  const feeder = await getFeeder();
  if (!feeder) return null;
  if (!feeder.packages.some((p) => p.slug === AUTOPUBLISH_SLUG && p.owned)) return null;
  return feeder.user;
}

export async function getAccount(userId: string): Promise<AccountRow | null> {
  const { data, error } = await feederDb().from("ad_accounts").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`Autopublish account: ${error.message}`);
  return (data as AccountRow | null) ?? null;
}

export type TemplateItem = { id: string; version: number; is_active: boolean; updated_at: string; last_validated_at: string | null; data: TemplateData };

export async function listTemplates(userId: string): Promise<TemplateItem[]> {
  const { data, error } = await feederDb().from("ad_templates").select("*").eq("user_id", userId).is("deleted_at", null).order("updated_at", { ascending: false });
  if (error) throw new Error(`Autopublish templates: ${error.message}`);
  return (data ?? []).map((r) => ({ id: r.id, version: r.version, is_active: r.is_active, updated_at: r.updated_at, last_validated_at: r.last_validated_at, data: readTemplate(r) }));
}

export async function getTemplate(userId: string, id: string): Promise<TemplateItem | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await feederDb().from("ad_templates").select("*").eq("user_id", userId).eq("id", id).is("deleted_at", null).maybeSingle();
  return data ? { id: data.id, version: data.version, is_active: data.is_active, updated_at: data.updated_at, last_validated_at: data.last_validated_at, data: readTemplate(data) } : null;
}

export type LaunchListItem = Pick<LaunchRow, "ref" | "product_name" | "form_name" | "template_name" | "summary" | "state" | "created_at" | "problem" | "totals">;

export async function listLaunches(userId: string, limit = 50): Promise<LaunchListItem[]> {
  const { data, error } = await feederDb()
    .from("ad_launches")
    .select("ref, product_name, form_name, template_name, summary, state, created_at, problem, totals")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Autopublish launches: ${error.message}`);
  return (data ?? []) as LaunchListItem[];
}

export type CreativeView = CreativeRow & { url: string | null };

export async function getLaunch(userId: string, ref: string) {
  if (!/^AP-[A-Z2-9]{6}$/.test(ref)) return null;
  const db = feederDb();
  const { data: launch } = await db.from("ad_launches").select("*").eq("user_id", userId).eq("ref", ref).maybeSingle();
  if (!launch) return null;
  const [{ data: nodes }, { data: creatives }, { data: events }] = await Promise.all([
    db.from("ad_nodes").select("*").eq("launch_ref", ref),
    db.from("ad_creatives").select("*").eq("launch_ref", ref).order("position"),
    db.from("ad_events").select("id, launch_ref, type, actor, message, created_at").eq("launch_ref", ref).order("created_at", { ascending: false }).limit(100),
  ]);
  const list = (creatives ?? []) as CreativeRow[];
  const { data: signed } = list.length ? await db.storage.from(BUCKET).createSignedUrls(list.map((c) => c.storage_path), 3600) : { data: [] };
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return {
    launch: launch as LaunchRow,
    nodes: (nodes ?? []) as NodeRow[],
    creatives: list.map((c) => ({ ...c, url: urls.get(c.storage_path) ?? null })) as CreativeView[],
    events: (events ?? []) as EventRow[],
  };
}

/** WhatsApp formatting (*bold*, _italic_, ~strike~) → plain text: Facebook and TikTok would show the marks. */
const plain = (t: string | null) => t?.replace(/\*([^*\n]+)\*/g, "$1").replace(/_([^_\n]+)_/g, "$1").replace(/~([^~\n]+)~/g, "$1").trim() || null;

/**
 * The customer's Feeder products with their form names and selling price (launch screen), and what
 * Lingo Feeder knows about each (lingo_feeder.products, same product IDs) for the ad text:
 * details = the full description, about = the short description.
 */
export async function launchProducts(userId: string) {
  const { products } = await mySetup(userId);
  const facts = new Map<number, { details: string | null; about: string | null }>();
  if (products.length) {
    try {
      const { data } = await lfDb().from("products").select("product_id, short_description, long_description").in("product_id", products.map((p) => p.product_id));
      for (const r of (data ?? []) as { product_id: number; short_description: string | null; long_description: string | null }[]) {
        facts.set(r.product_id, { details: plain(r.long_description), about: plain(r.short_description) });
      }
    } catch {
      // Lingo Feeder's schema isn't exposed: the template's text is used as it is.
    }
  }
  return products.map((p) => ({ product_id: p.product_id, name: p.product_name, form_names: p.form_names, price: p.my_price ?? p.price, details: facts.get(p.product_id)?.details ?? null, about: facts.get(p.product_id)?.about ?? null }));
}
