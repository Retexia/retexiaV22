"use server";

import { isSectionType, sectionSchemas } from "@retexia/content";
import type { Json } from "@retexia/supabase";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbMessage, run, type ActionResult } from "@/lib/action";
import { requireRole } from "@/lib/auth";
import { revalidateWebsite } from "@/lib/revalidate";

const uuid = z.uuid();
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]*$/, "Lowercase letters, numbers and dashes");
const opt = (max: number) => z.string().max(max).optional().transform((v) => (v?.trim() ? v.trim() : null));
const href = z.string().trim().max(500).refine((v) => v === "" || /^(\/|#|https?:\/\/|mailto:|tel:)/.test(v), "Start with /, #, https://, mailto: or tel:");

/** Refresh the admin and tell the website to drop its cache. */
async function published(message: string, table: string): Promise<ActionResult> {
  revalidatePath("/", "layout");
  const live = await revalidateWebsite(table);
  return { ok: true, message: live ? `${message} · live on website` : message };
}

// ---------------------------------------------------------------------------
// FAQs, services, testimonials, navigation
// ---------------------------------------------------------------------------

export async function saveFaq(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("editContent");
    const d = z
      .object({ id: uuid.optional(), product_id: uuid.nullable(), question: z.string().trim().min(3).max(300), answer: z.string().trim().min(1).max(4000), is_visible: z.boolean() })
      .parse(input);
    const { id, ...row } = d;
    const { error } = id ? await supabase.from("faqs").update(row).eq("id", id) : await supabase.from("faqs").insert({ ...row, sort_order: 999 });
    if (error) return { ok: false, message: dbMessage(error) };
    return published("FAQ saved", "faqs");
  });
}

export async function saveService(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("editContent");
    const d = z
      .object({ id: uuid.optional(), title: z.string().trim().min(2).max(120), description: opt(600), icon: opt(60), href: href.optional(), is_visible: z.boolean() })
      .parse(input);
    const { id, ...rest } = d;
    const row = { ...rest, href: rest.href || null };
    const { error } = id ? await supabase.from("services").update(row).eq("id", id) : await supabase.from("services").insert({ ...row, sort_order: 999 });
    if (error) return { ok: false, message: dbMessage(error) };
    return published("Service saved", "services");
  });
}

export async function saveTestimonial(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("editContent");
    const d = z
      .object({
        id: uuid.optional(),
        quote: z.string().trim().min(5).max(1200),
        author_name: z.string().trim().min(1).max(120),
        author_role: opt(120),
        company: opt(120),
        avatar_url: opt(500),
        product_id: uuid.nullable(),
        is_visible: z.boolean(),
      })
      .parse(input);
    const { id, ...row } = d;
    const { error } = id ? await supabase.from("testimonials").update(row).eq("id", id) : await supabase.from("testimonials").insert({ ...row, sort_order: 999 });
    if (error) return { ok: false, message: dbMessage(error) };
    return published("Testimonial saved", "testimonials");
  });
}

export async function saveNavItem(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("editContent");
    const d = z
      .object({
        id: uuid.optional(),
        location: z.enum(["header", "footer_products", "footer_company", "footer_legal"]),
        kind: z.enum(["link", "button", "products_menu"]),
        label: z.string().trim().min(1).max(60),
        href: href.optional(),
        signed_in_label: opt(60),
        signed_in_href: href.optional(),
        open_in_new_tab: z.boolean(),
        is_visible: z.boolean(),
      })
      .parse(input);
    if (d.kind !== "products_menu" && !d.href) return { ok: false, message: "Add a link.", fieldErrors: { href: "Required" } };
    const { id, ...rest } = d;
    const row = { ...rest, href: rest.kind === "products_menu" ? null : rest.href || null, signed_in_href: rest.signed_in_href || null };
    const { error } = id ? await supabase.from("navigation_items").update(row).eq("id", id) : await supabase.from("navigation_items").insert({ ...row, sort_order: 999 });
    if (error) return { ok: false, message: dbMessage(error) };
    return published("Menu saved", "navigation_items");
  });
}

/** Delete a website content row (whitelisted tables). */
export async function deleteContent(input: { table: string; id: string }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("editContent");
    const d = z.object({ table: z.enum(["faqs", "services", "testimonials", "navigation_items", "page_sections"]), id: uuid }).parse(input);
    const { error } = await supabase.from(d.table).delete().eq("id", d.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return published("Deleted", d.table);
  });
}

export async function reorderContent(input: { table: string; ids: string[] }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("editContent");
    const d = z.object({ table: z.enum(["faqs", "services", "testimonials", "navigation_items", "page_sections"]), ids: z.array(uuid).max(500) }).parse(input);
    const { error } = await supabase.rpc("admin_reorder", { p_table: d.table, p_ids: d.ids });
    if (error) return { ok: false, message: dbMessage(error) };
    return published("Order saved", d.table);
  });
}

// ---------------------------------------------------------------------------
// Pages and sections
// ---------------------------------------------------------------------------

// "" is the home page.
const pageSlug = z.union([z.literal(""), slug]);

const pageInput = z.object({
  id: uuid.optional(),
  slug: pageSlug,
  title: z.string().trim().min(1).max(120),
  seo_title: opt(70),
  seo_description: opt(170),
  og_image_url: opt(500),
  is_published: z.boolean(),
  show_in_sitemap: z.boolean(),
  product_id: uuid.nullable(),
});

/** Paths the website app itself serves. */
const RESERVED = ["account", "login", "signup", "forgot-password", "reset-password", "auth", "api", "maintenance", "sitemap.xml", "robots.txt", "icon", "_next"];

export async function savePage(input: unknown): Promise<ActionResult<string>> {
  return run(async () => {
    const { supabase } = await requireRole("editContent");
    const d = pageInput.parse(input);
    if (RESERVED.includes(d.slug)) return { ok: false, message: `“${d.slug}” is used by the website itself.`, fieldErrors: { slug: "Reserved" } };
    const { id, ...row } = d;
    if (!id && row.slug === "") return { ok: false, message: "Give the page a web address.", fieldErrors: { slug: "Required" } };
    if (id) {
      const { data: before } = await supabase.from("pages").select("slug").eq("id", id).single();
      if (before?.slug === "" && row.slug !== "") return { ok: false, message: "The home page address can't change.", fieldErrors: { slug: "Locked" } };
      const { error } = await supabase.from("pages").update(row).eq("id", id);
      if (error) return { ok: false, message: dbMessage(error) };
      const r = await published("Page saved", "pages");
      return { ...r, data: id } as ActionResult<string>;
    }
    const { data, error } = await supabase.from("pages").insert(row).select("id").single();
    if (error || !data) return { ok: false, message: dbMessage(error) };
    const r = await published("Page created", "pages");
    return { ...r, data: data.id } as ActionResult<string>;
  });
}

export async function duplicatePage(input: { id: string; slug: string; title: string }): Promise<ActionResult<string>> {
  return run(async () => {
    const { supabase } = await requireRole("editContent");
    const d = z.object({ id: uuid, slug, title: z.string().trim().min(1).max(120) }).parse(input);
    const { data: page } = await supabase.from("pages").select("*").eq("id", d.id).single();
    if (!page) return { ok: false, message: "Page not found." };
    const { data: copy, error } = await supabase
      .from("pages")
      .insert({ slug: d.slug, title: d.title, seo_title: page.seo_title, seo_description: page.seo_description, og_image_url: page.og_image_url, is_published: false, show_in_sitemap: page.show_in_sitemap, product_id: null })
      .select("id")
      .single();
    if (error || !copy) return { ok: false, message: dbMessage(error) };
    const { data: sections } = await supabase.from("page_sections").select("*").eq("page_id", d.id).order("sort_order");
    if (sections?.length) {
      const { error: e2 } = await supabase.from("page_sections").insert(
        sections.map(({ id: _id, created_at: _c, updated_at: _u, page_id: _p, ...s }) => ({ ...s, page_id: copy.id })),
      );
      if (e2) return { ok: false, message: dbMessage(e2) };
    }
    revalidatePath("/website", "layout");
    return { ok: true, message: `${d.title} created (unpublished)`, data: copy.id };
  });
}

export async function deletePage(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("manageSettings");
    const id = uuid.parse(input.id);
    const { data: page } = await supabase.from("pages").select("slug").eq("id", id).single();
    if (!page) return { ok: false, message: "Page not found." };
    if (page.slug === "") return { ok: false, message: "The home page can't be deleted." };
    const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("page_slug", page.slug);
    if (count) return { ok: false, message: "A product uses this page. Pick another page for the product first." };
    const { error } = await supabase.from("pages").delete().eq("id", id);
    if (error) return { ok: false, message: dbMessage(error) };
    return published("Page deleted", "pages");
  });
}

const sectionInput = z.object({
  id: uuid.optional(),
  page_id: uuid,
  type: z.string().refine(isSectionType, "Unknown section type"),
  eyebrow: opt(120),
  title: opt(240),
  highlight: opt(120),
  subtitle: opt(800),
  anchor: z
    .string()
    .max(40)
    .optional()
    .transform((v) => (v?.trim() ? v.trim().toLowerCase() : null))
    .refine((v) => v === null || /^[a-z][a-z0-9-]*$/.test(v), "Letters, numbers and dashes"),
  background: z.enum(["surface", "sunk"]),
  content: z.unknown(),
  is_visible: z.boolean(),
});

export async function saveSection(input: unknown): Promise<ActionResult<string>> {
  return run(async () => {
    const { supabase } = await requireRole("editContent");
    const d = sectionInput.parse(input);
    const schema = sectionSchemas[d.type as keyof typeof sectionSchemas];
    const parsed = schema.safeParse(d.content);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) fieldErrors[`content.${issue.path.join(".")}`] ??= issue.message;
      return { ok: false, message: "Some section fields need attention.", fieldErrors };
    }
    if (d.highlight && d.title && !d.title.includes(d.highlight)) {
      return { ok: false, message: "The highlight must be part of the title.", fieldErrors: { highlight: "Not found in the title" } };
    }
    const { id, ...rest } = d;
    const row = { ...rest, content: parsed.data as Json };
    if (id) {
      const { error } = await supabase.from("page_sections").update(row).eq("id", id);
      if (error) return { ok: false, message: dbMessage(error) };
      const r = await published("Section saved", "page_sections");
      return { ...r, data: id } as ActionResult<string>;
    }
    const { data, error } = await supabase.from("page_sections").insert({ ...row, sort_order: 999 }).select("id").single();
    if (error || !data) return { ok: false, message: dbMessage(error) };
    const r = await published("Section added", "page_sections");
    return { ...r, data: data.id } as ActionResult<string>;
  });
}

export async function duplicateSection(input: { id: string }): Promise<ActionResult<string>> {
  return run(async () => {
    const { supabase } = await requireRole("editContent");
    const id = uuid.parse(input.id);
    const { data: s } = await supabase.from("page_sections").select("*").eq("id", id).single();
    if (!s) return { ok: false, message: "Section not found." };
    const { id: _id, created_at: _c, updated_at: _u, ...copy } = s;
    const { data, error } = await supabase
      .from("page_sections")
      .insert({ ...copy, anchor: null, is_visible: false, sort_order: s.sort_order })
      .select("id")
      .single();
    if (error || !data) return { ok: false, message: dbMessage(error) };
    // Put the copy right after the original.
    const { data: all } = await supabase.from("page_sections").select("id").eq("page_id", s.page_id).order("sort_order").order("created_at");
    const ids = (all ?? []).map((r) => r.id).filter((x) => x !== data.id);
    ids.splice(ids.indexOf(id) + 1, 0, data.id);
    await supabase.rpc("admin_reorder", { p_table: "page_sections", p_ids: ids });
    revalidatePath("/website", "layout");
    return { ok: true, message: "Section copied (hidden until you show it)", data: data.id };
  });
}

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------

export async function saveString(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("editContent");
    const d = z
      .object({ key: z.string().regex(/^[a-z0-9_.-]+$/i).max(120), value: z.string().max(4000), description: opt(300) })
      .parse(input);
    const { error } = await supabase.from("site_strings").upsert(d, { onConflict: "key" });
    if (error) return { ok: false, message: dbMessage(error) };
    return published("Text saved", "site_strings");
  });
}

/** Remove a text the website no longer uses. */
export async function resetString(input: { key: string }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("editContent");
    const key = z.string().max(120).parse(input.key);
    const { error } = await supabase.from("site_strings").delete().eq("key", key);
    if (error) return { ok: false, message: dbMessage(error) };
    return published("Removed", "site_strings");
  });
}

// ---------------------------------------------------------------------------
// Media library (site-assets bucket)
// ---------------------------------------------------------------------------

const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/x-icon": "ico",
};
const MAX_BYTES = 5 * 1024 * 1024;

/** Upload one image. Type and size are checked here, not only in the browser. */
export async function uploadMedia(formData: FormData): Promise<ActionResult<{ id: string; url: string }>> {
  return run(async () => {
    const staff = await requireRole("editContent");
    const file = formData.get("file");
    if (!(file instanceof File)) return { ok: false, message: "Choose a file." };
    const ext = IMAGE_TYPES[file.type];
    if (!ext) return { ok: false, message: "Use PNG, JPG, WebP, GIF, AVIF, SVG or ICO." };
    if (file.size > MAX_BYTES) return { ok: false, message: "Images must be 5 MB or smaller." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (ext === "svg") {
      const svg = new TextDecoder().decode(bytes);
      if (/<script|on[a-z]+\s*=|javascript:|<foreignObject/i.test(svg)) return { ok: false, message: "This SVG contains scripts, so it can't be used." };
    }
    const width = Number(formData.get("width")) || null;
    const height = Number(formData.get("height")) || null;
    const alt = z.string().max(300).parse(String(formData.get("alt") ?? ""));
    const base = file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "image";
    const path = `media/${new Date().toISOString().slice(0, 7)}/${base}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const { error } = await staff.supabase.storage.from("site-assets").upload(path, bytes, { contentType: file.type, upsert: false, cacheControl: "31536000" });
    if (error) return { ok: false, message: error.message };
    const { data: pub } = staff.supabase.storage.from("site-assets").getPublicUrl(path);
    const { data: row, error: e2 } = await staff.supabase
      .from("media")
      .insert({ path, url: pub.publicUrl, mime: file.type, size: file.size, width, height, alt: alt || null, uploaded_by: staff.user.id })
      .select("id")
      .single();
    if (e2 || !row) return { ok: false, message: dbMessage(e2) };
    revalidatePath("/website/media");
    return { ok: true, message: "Uploaded", data: { id: row.id, url: pub.publicUrl } };
  });
}

export async function updateMediaAlt(input: { id: string; alt: string }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("editContent");
    const d = z.object({ id: uuid, alt: z.string().max(300) }).parse(input);
    const { error } = await supabase.from("media").update({ alt: d.alt.trim() || null }).eq("id", d.id);
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath("/website/media");
    return { ok: true, message: "Alt text saved" };
  });
}

/** Where a media URL is used (sections, settings, products, testimonials). */
export async function mediaUsage(input: { url: string }): Promise<string[]> {
  const { supabase } = await requireRole("editContent");
  const url = z.string().max(1000).parse(input.url);
  // Sections are few; checking their JSON here avoids casting in the API filter.
  const [sections, settings, testimonials, pages] = await Promise.all([
    supabase.from("page_sections").select("id, type, title, content, pages(title, slug)").limit(2000),
    supabase.from("site_settings").select("logo_url, logo_dark_url, favicon_url, og_image_url, invoice_logo_url").eq("id", 1).maybeSingle(),
    supabase.from("testimonials").select("author_name").eq("avatar_url", url),
    supabase.from("pages").select("title").eq("og_image_url", url),
  ]);
  const uses: string[] = [];
  for (const s of (sections.data ?? []).filter((x) => JSON.stringify(x.content).includes(url))) {
    const p = s.pages as { title?: string; slug?: string } | null;
    uses.push(`Page “${p?.title ?? p?.slug}” → ${s.type} section${s.title ? ` “${s.title}”` : ""}`);
  }
  for (const [k, v] of Object.entries(settings.data ?? {})) if (v === url) uses.push(`Site settings → ${k.replace(/_/g, " ")}`);
  for (const t of testimonials.data ?? []) uses.push(`Testimonial by ${t.author_name}`);
  for (const p of pages.data ?? []) uses.push(`Share image of page “${p.title}”`);
  return uses;
}

export async function deleteMedia(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("editContent");
    const id = uuid.parse(input.id);
    const { data: m } = await supabase.from("media").select("path, url").eq("id", id).single();
    if (!m) return { ok: false, message: "File not found." };
    const uses = await mediaUsage({ url: m.url });
    if (uses.length) return { ok: false, message: `Still used: ${uses.slice(0, 3).join("; ")}${uses.length > 3 ? "…" : ""}` };
    const { error } = await supabase.storage.from("site-assets").remove([m.path]);
    if (error) return { ok: false, message: error.message };
    const { error: e2 } = await supabase.from("media").delete().eq("id", id);
    if (e2) return { ok: false, message: dbMessage(e2) };
    revalidatePath("/website/media");
    return { ok: true, message: "Deleted" };
  });
}

export type MediaItem = { id: string; url: string; alt: string | null; mime: string | null; size: number | null; width: number | null; height: number | null; created_at: string };

/** Recent media for pickers. */
export async function listMedia(input: { q?: string } = {}): Promise<MediaItem[]> {
  const { supabase } = await requireRole("editContent");
  const q = z.string().max(100).optional().parse(input.q)?.trim();
  let query = supabase.from("media").select("id, url, alt, mime, size, width, height, created_at").order("created_at", { ascending: false }).limit(120);
  if (q) query = query.or(`alt.ilike.%${q.replace(/[%_,()"]/g, "")}%,path.ilike.%${q.replace(/[%_,()"]/g, "")}%`);
  const { data } = await query;
  return data ?? [];
}
