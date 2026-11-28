"use client";

import { createBrowserClient } from "@retexia/supabase/browser";
import { Alert, Badge, Button, Card, Field, Input, Select, Textarea } from "@retexia/ui";
import { CheckCircle2, CircleAlert, FileVideo, ImageIcon, LoaderCircle, Rocket, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createUpload, submitLaunch } from "@/app/feeder/(app)/autopublish/actions";
import { clearDraft, saveDraft } from "@/app/feeder/(app)/drafts/actions";
import {
  applyOverrides,
  compile,
  CTAS,
  fillCopy,
  mainBudget,
  MAX_CREATIVES,
  money,
  PLATFORM_LONG,
  presetLabel,
  type Issue,
  type Overrides,
  type PlanNode,
  type Platform,
  type TemplateData,
} from "@/lib/feeder/autopublish/plan";

export type StudioTemplate = { id: string; data: TemplateData };
export type StudioProduct = { product_id: number; name: string; form_names: string[]; price: number; details?: string | null; about?: string | null };
export type StudioAccount = {
  currency: string;
  meta: boolean;
  tiktok: boolean;
  metaStatus: string;
  tiktokStatus: string;
  metaForms: { id: string; name: string; status?: string }[];
  tiktokForms: { id: string; name: string }[];
  privacy: boolean;
  /** The seller's own Business portfolio ad accounts Autopublish may use (Connections); empty = the one account. */
  adAccounts?: { id: string; name: string; currency: string | null; isDefault: boolean }[];
};

type Item = {
  id: string;
  /** null for a file restored from the draft (already uploaded). */
  file: File | null;
  mime: string;
  size: number;
  name: string;
  kind: "video" | "image";
  preview: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  status: "uploading" | "done" | "error";
  path: string | null;
  error: string | null;
};

const ACCEPT = "video/mp4,video/quicktime,image/jpeg,image/png";
const KIND: Record<string, "video" | "image"> = { "video/mp4": "video", "video/quicktime": "video", "image/jpeg": "image", "image/png": "image" };
const key = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const today = () => new Date().toLocaleDateString("en-CA");

function readMeta(file: File, url: string): Promise<{ width: number | null; height: number | null; duration: number | null }> {
  return new Promise((resolve) => {
    if (file.type.startsWith("image/")) {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, duration: null });
      img.onerror = () => resolve({ width: null, height: null, duration: null });
      img.src = url;
      return;
    }
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => resolve({ width: v.videoWidth || null, height: v.videoHeight || null, duration: Number.isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : null });
    v.onerror = () => resolve({ width: null, height: null, duration: null });
    v.src = url;
  });
}

/** Plain notes about a file for each platform (sizes, length, shape). Warnings only: the platforms decide. */
function mediaNotes(c: Item, platforms: Platform[]) {
  const notes: string[] = [];
  if (!c.width || !c.height) return notes;
  const ratio = c.width / c.height;
  if (c.kind === "image" && Math.min(c.width, c.height) < 600) notes.push("Small image: at least 1080 px wide looks sharp.");
  if (c.kind === "video") {
    if (Math.min(c.width, c.height) < 540) notes.push("Low resolution: export at 720p or more.");
    if (c.duration != null && c.duration > 240) notes.push("Over 4 minutes: short videos (under 60 s) usually do better.");
    if (platforms.includes("tiktok")) {
      if (Math.abs(ratio - 9 / 16) > 0.05) notes.push("TikTok works best with tall 9:16 videos.");
      if (c.duration != null && c.duration < 5) notes.push("TikTok needs at least 5 seconds.");
      if (c.duration != null && c.duration > 600) notes.push("TikTok allows up to 10 minutes.");
    }
    if (platforms.includes("meta") && ratio > 1.2) notes.push("Wide video: square or tall shows bigger in the feed and Reels.");
  }
  return notes;
}

/** A local preview of a chosen file (object URL, never uploaded anywhere but Retexia's storage). */
export function Thumb({ kind, src, controls = false }: { kind: "video" | "image"; src: string; controls?: boolean }) {
  if (kind === "video") return <video src={src} muted playsInline controls={controls} preload="metadata" className="size-full object-cover" />;
  // eslint-disable-next-line @next/next/no-img-element -- local preview / signed storage link
  return <img src={src} alt="" className="size-full object-cover" />;
}

function Tree({ nodes, platform, currency }: { nodes: PlanNode[]; platform: Platform; currency: string }) {
  const own = nodes.filter((n) => n.platform === platform);
  const camps = own.filter((n) => n.level === "campaign");
  const roots = camps.length ? camps : [null];
  const budget = (n: PlanNode) => (n.budget_daily != null ? ` · ${money(n.budget_daily, currency)}/day` : n.budget_lifetime != null ? ` · ${money(n.budget_lifetime, currency)} total` : "");
  const tag = (n: PlanNode) => (n.action === "reuse" ? " (existing)" : "");
  return (
    <ul className="flex flex-col gap-1.5 type-small">
      {roots.map((c) => (
        <li key={c?.key ?? "none"}>
          {c ? (
            <span className="text-ink">
              Campaign · {c.name}
              {tag(c)}
              <span className="text-ink-muted">{budget(c)}</span>
            </span>
          ) : null}
          <ul className={`flex flex-col gap-1 ${c ? "mt-1 border-l border-line pl-3" : ""}`}>
            {own
              .filter((s) => s.level === "adset" && s.parent_key === (c?.key ?? null))
              .map((s) => (
                <li key={s.key}>
                  <span className="text-ink">
                    {platform === "tiktok" ? "Ad group" : "Ad set"} · {s.name}
                    {tag(s)}
                    <span className="text-ink-muted">{budget(s)}</span>
                  </span>
                  <span className="block text-ink-muted">
                    {own.filter((a) => a.level === "ad" && a.parent_key === s.key).length} ad(s): {own.filter((a) => a.level === "ad" && a.parent_key === s.key).map((a) => `#${a.creative_positions[0]}`).join(", ")}
                  </span>
                </li>
              ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/**
 * The launch screen: product (its form name names everything), creatives
 * (uploaded straight to private storage), template and allowed changes, and a
 * live preview of exactly what will be made — computed by the same compiler
 * the server uses — then Launch.
 */
export type StudioDraft = {
  templateId?: string; productId?: number | ""; formName?: string; o?: Overrides; metaForm?: string; ttForm?: string; adIds?: string[];
  creatives?: { path: string; name: string; kind: "video" | "image"; mime: string; size: number; width: number | null; height: number | null; duration: number | null; preview: string }[];
};

export function LaunchStudio({
  templates, products, account, initialTemplate, draft = null,
}: { templates: StudioTemplate[]; products: StudioProduct[]; account: StudioAccount; initialTemplate: string | null; draft?: StudioDraft | null }) {
  const router = useRouter();
  const d0 = draft ?? {};
  const [templateId, setTemplateId] = useState(
    initialTemplate && templates.some((t) => t.id === initialTemplate) ? initialTemplate : d0.templateId && templates.some((t) => t.id === d0.templateId) ? d0.templateId : (templates[0]?.id ?? ""),
  );
  const [productId, setProductId] = useState<number | "">(
    d0.productId && products.some((p) => p.product_id === d0.productId) ? d0.productId : products.length === 1 ? products[0]!.product_id : "",
  );
  const [formName, setFormName] = useState(d0.formName ?? (products.length === 1 ? (products[0]!.form_names[0] ?? products[0]!.name) : ""));
  const [items, setItems] = useState<Item[]>(() =>
    (d0.creatives ?? []).map((c) => ({ id: crypto.randomUUID(), file: null, mime: c.mime, size: c.size, name: c.name, kind: c.kind, preview: c.preview, width: c.width, height: c.height, duration: c.duration, status: "done" as const, path: c.path, error: null })),
  );
  const [o, setO] = useState<Overrides>(d0.o ?? {});
  const [metaForm, setMetaForm] = useState(d0.metaForm ?? "");
  const [ttForm, setTtForm] = useState(d0.ttForm ?? "");
  const adAccounts = account.adAccounts ?? [];
  // Several ad accounts at once: one launch each (TikTok only with the first).
  const [adIds, setAdIds] = useState<string[]>(() => {
    const kept = (d0.adIds ?? []).filter((id) => adAccounts.some((a) => a.id === id));
    if (kept.length) return kept;
    const d = adAccounts.find((a) => a.isDefault)?.id ?? adAccounts[0]?.id;
    return d ? [d] : [];
  });

  // The draft: kept on Retexia while you work (a second after each change), cleared after a launch or "Start over".
  const [savedAt, setSavedAt] = useState(Boolean(draft));
  const skipFirst = useRef(true);
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    const uploaded = items.filter((c) => c.status === "done" && c.path);
    const t = setTimeout(() => {
      void saveDraft({
        tool: "autopublish",
        data: {
          templateId, productId, formName, o, metaForm, ttForm, adIds,
          creatives: uploaded.map((c) => ({ path: c.path, name: c.name, kind: c.kind, mime: c.mime, size: c.size, width: c.width, height: c.height, duration: c.duration })),
        },
      }).then((r) => r.ok && setSavedAt(true));
    }, 1000);
    return () => clearTimeout(t);
  }, [templateId, productId, formName, o, metaForm, ttForm, adIds, items]);
  const startOver = async () => {
    await clearDraft({ tool: "autopublish" });
    setProductId(""); setFormName(""); setItems([]); setO({}); setMetaForm(""); setTtForm(""); setSavedAt(false);
    skipFirst.current = true;
    toast.success("Started over.");
  };
  const toggleAd = (id: string) => setAdIds((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const otherCurrency = adAccounts.filter((a) => adIds.includes(a.id) && a.currency && a.currency !== account.currency);
  const [busy, setBusy] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const tpl = templates.find((t) => t.id === templateId)?.data ?? null;
  const product = products.find((p) => p.product_id === productId) ?? null;
  const names = product ? [...new Set([...product.form_names, product.name])] : [];

  const pickProduct = (value: string) => {
    const p = products.find((x) => x.product_id === Number(value));
    setProductId(p ? p.product_id : "");
    setFormName(p ? (p.form_names[0] ?? p.name) : "");
    // The ad text from Lingo Feeder's product details (lingo_feeder.products), when the template lets it change.
    const tplNow = templates.find((t) => t.id === templateId)?.data;
    if (p && tplNow?.overridable.includes("copy") && (p.details || p.about)) {
      setO((x) => ({
        ...x,
        copy: {
          ...x.copy,
          primary_text: (p.details || p.about || "").slice(0, 2000),
          headline: p.name.slice(0, 40),
          ...(p.about ? { description: p.about.slice(0, 255) } : {}),
        },
      }));
    }
  };

  const pickedMeta = account.metaForms.find((f) => f.id === metaForm) ?? null;
  const pickedTt = account.tiktokForms.find((f) => f.id === ttForm) ?? null;
  const usedName = pickedMeta?.name ?? formName;

  const preview = useMemo(() => {
    if (!tpl || !product) return null;
    const { template, warnings } = applyOverrides(tpl, o);
    const r = compile({
      template,
      creatives: items.map((c, i) => ({ position: i + 1, kind: c.kind, name: c.name || `#${i + 1}` })),
      product: { name: product.name, form_name: usedName, price: product.price },
      currency: account.currency,
      date: today(),
    });
    const extra: Issue[] = [];
    for (const p of template.platforms) {
      if (!(p === "meta" ? account.meta : account.tiktok)) extra.push({ field: "account", platform: p, message: `${PLATFORM_LONG[p]} isn't connected yet (Connections).` });
      if (p === "meta" && adAccounts.length > 1 && !adIds.length) extra.push({ field: "meta_ad_account_id", platform: p, message: "Tick at least one ad account." });
    }
    if (template.objective === "leads" && template.platforms.includes("meta")) {
      if (template.destination.lead_form.mode === "pick" && !pickedMeta) extra.push({ field: "meta_form", message: "Pick the Instant Form." });
      if (template.destination.lead_form.mode === "product" && !pickedMeta && !account.privacy && !account.metaForms.some((f) => key(f.name) === key(usedName))) {
        extra.push({ field: "account.privacy_policy_url", message: `No form named "${usedName}" on your Page yet: add your privacy policy link in Connections so Retexia can make it.` });
      }
    }
    return { template, ...r, errors: [...extra, ...r.errors], warnings: [...warnings, ...r.warnings] };
  }, [tpl, product, o, items, usedName, account, pickedMeta, adAccounts.length, adIds.length]);

  const formOnPage = account.metaForms.find((f) => key(f.name) === key(usedName) && (!f.status || f.status === "ACTIVE"));
  const ttAuto = account.tiktokForms.find((f) => product && [usedName, ...product.form_names].some((n) => key(n) === key(f.name)));

  async function addFiles(list: FileList | File[]) {
    const files = [...list].slice(0, MAX_CREATIVES - items.length);
    if (list.length > files.length) toast.warning(`Up to ${MAX_CREATIVES} creatives per launch.`);
    for (const file of files) {
      const kind = KIND[file.type];
      if (!kind) {
        toast.error(`${file.name}: use MP4 / MOV videos or JPG / PNG images.`);
        continue;
      }
      if (file.size > 200 * 1024 * 1024) {
        toast.error(`${file.name} is over 200 MB.`);
        continue;
      }
      const id = crypto.randomUUID();
      const url = URL.createObjectURL(file);
      const meta = await readMeta(file, url);
      const item: Item = { id, file, mime: file.type, size: file.size, name: file.name.replace(/\.[^.]+$/, "").slice(0, 120), kind, preview: url, ...meta, status: "uploading", path: null, error: null };
      setItems((x) => [...x, item]);
      void upload(item);
    }
  }

  async function upload(item: Item) {
    const set = (p: Partial<Item>) => setItems((x) => x.map((i) => (i.id === item.id ? { ...i, ...p } : i)));
    if (!item.file) return;
    const r = await createUpload({ name: item.file.name, type: item.file.type, size: item.file.size });
    if (!r.ok || !r.data) return set({ status: "error", error: r.ok ? "Upload failed" : r.message });
    const { error } = await createBrowserClient().storage.from("autopublish").uploadToSignedUrl(r.data.path, r.data.token, item.file, { contentType: item.file.type });
    if (error) return set({ status: "error", error: "Upload failed. Remove it and add it again." });
    set({ status: "done", path: r.data.path });
  }

  async function launch() {
    if (!tpl || !product || !preview) return;
    setBusy(true);
    setServerErrors({});
    const r = await submitLaunch({
      template_id: templateId,
      product_id: product.product_id,
      form_name: usedName,
      creatives: items.map((c) => ({ path: c.path!, name: c.name.trim() || "Creative", kind: c.kind, mime: c.mime, size: c.size, width: c.width, height: c.height, duration: c.duration })),
      overrides: o,
      meta_form: pickedMeta ? { id: pickedMeta.id, name: pickedMeta.name } : null,
      tiktok_form: pickedTt ? { id: pickedTt.id, name: pickedTt.name } : null,
      meta_ad_account_ids: adAccounts.length ? adIds : undefined,
    });
    setBusy(false);
    if (!r.ok) {
      setServerErrors(r.fieldErrors ?? {});
      return toast.error(r.message);
    }
    toast.success(r.message ?? "Launched");
    await clearDraft({ tool: "autopublish" });
    router.push(`/autopublish/launches/${r.data!.ref}`);
  }

  if (!templates.length || !products.length) {
    return (
      <Card className="flex flex-col gap-3">
        <h2 className="type-h2 text-ink">Two things first</h2>
        <ul className="flex flex-col gap-2 type-body">
          <li className="flex items-center gap-2">
            {products.length ? <CheckCircle2 aria-hidden size={18} className="text-success" /> : <CircleAlert aria-hidden size={18} className="text-warning" />}
            {products.length ? "Your products are added." : <span>Add the products you sell in <Link href="/products" className="text-brand underline-offset-4 hover:underline">My products</Link> (with their form names).</span>}
          </li>
          <li className="flex items-center gap-2">
            {templates.length ? <CheckCircle2 aria-hidden size={18} className="text-success" /> : <CircleAlert aria-hidden size={18} className="text-warning" />}
            {templates.length ? "You have a template." : <span>Make a <Link href="/autopublish/templates/new" className="text-brand underline-offset-4 hover:underline">template</Link>: layout, budget, audience and ad text.</span>}
          </li>
        </ul>
      </Card>
    );
  }

  const uploading = items.some((i) => i.status === "uploading");
  const failed = items.some((i) => i.status === "error");
  const blocked = !preview || preview.errors.length > 0 || uploading || failed || !items.length;
  const canChange = (k: "budget" | "start" | "copy") => tpl?.overridable.includes(k);
  const fe = (k: string) => serverErrors[k] ?? preview?.errors.find((e) => e.field === k)?.message;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-6">
        {!account.meta && !account.tiktok ? (
          <Alert tone="info" title="Connect an ad account to launch" action={<Button href="/connections#facebook" size="sm" variant="secondary">Connections</Button>}>
            You can try the preview now. Launching opens once Retexia confirms access to your Meta or TikTok account.
          </Alert>
        ) : null}

        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="type-h2 text-ink">1 · Product</h2>
            <span className="flex items-center gap-2 type-small text-ink-muted">
              {savedAt ? "Draft saved" : null}
              {savedAt ? (
                <Button size="sm" variant="ghost" onClick={startOver}>
                  Start over
                </Button>
              ) : null}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product" error={fe("product_id") ?? fe("product")} required>
              <Select value={String(productId)} onChange={(e) => pickProduct(e.target.value)} placeholder="Choose a product" options={products.map((p) => ({ value: String(p.product_id), label: p.name }))} />
            </Field>
            {pickedMeta ? null : (
              <Field label="Form name" error={fe("form_name")} required>
                <Select value={formName} onChange={(e) => setFormName(e.target.value)} disabled={!product} options={names.map((n) => ({ value: n, label: n }))} />
              </Field>
            )}
          </div>
          <p className="type-small text-ink-muted">
            {pickedMeta
              ? `Everything is named after the Instant Form "${pickedMeta.name}", so Bulk create puts every lead on this product.`
              : "The lead form, campaign, ad sets and ads are named after the form name, so Bulk create puts every lead on this product."}
          </p>
          {adAccounts.length > 1 && tpl?.platforms.includes("meta") ? (
            <Field
              label="Ad accounts (Facebook)"
              labelAs="legend"
              hint={
                otherCurrency.length
                  ? `${otherCurrency.map((a) => a.name).join(", ")} ${otherCurrency.length === 1 ? "is" : "are"} in another currency: the budget is in each account's currency.`
                  : `One launch on each ticked account${tpl.platforms.includes("tiktok") ? " (TikTok only once)" : ""}. From your Business portfolio (Connections).`
              }
              error={fe("meta_ad_account_id")}
            >
              <div className="flex flex-col gap-2 rounded-md border border-line p-3">
                {adAccounts.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 type-body text-ink">
                    <input type="checkbox" className="size-4 accent-[var(--rx-brand)]" checked={adIds.includes(a.id)} onChange={() => toggleAd(a.id)} />
                    {a.name}
                    {a.isDefault ? <span className="type-small text-ink-muted">(default)</span> : null}
                    {a.currency && a.currency !== account.currency ? <span className="type-small text-ink-muted">· {a.currency}</span> : null}
                  </label>
                ))}
              </div>
            </Field>
          ) : null}
          {tpl?.objective === "leads" && tpl.platforms.includes("meta") && product ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Instant Form (Facebook)"
                hint={
                  pickedMeta
                    ? `Its name "${pickedMeta.name}" becomes one of this product's form names.`
                    : formOnPage
                      ? `"${formOnPage.name}" is on your Page: it will be used.`
                      : account.privacy
                        ? `Retexia will make a form named "${usedName}".`
                        : "Pick a form, or add a privacy policy link in Connections so Retexia can make one."
                }
                error={fe("meta_form")}
                required={tpl.destination.lead_form.mode === "pick"}
              >
                <Select value={metaForm} onChange={(e) => setMetaForm(e.target.value)} placeholder={tpl.destination.lead_form.mode === "pick" ? "Choose a form" : "The one named after the product"} options={account.metaForms.filter((f) => !f.status || f.status === "ACTIVE").map((f) => ({ value: f.id, label: f.name }))} />
              </Field>
              {tpl.platforms.includes("tiktok") ? (
                <Field label="Instant Form (TikTok)" hint={pickedTt ? "Its name becomes one of this product's form names." : ttAuto ? `"${ttAuto.name}" will be used.` : `Make one named "${usedName}" in TikTok, or pick one.`} error={fe("tiktok_form")}>
                  <Select value={ttForm} onChange={(e) => setTtForm(e.target.value)} placeholder="The one named after the product" options={account.tiktokForms.map((f) => ({ value: f.id, label: f.name }))} />
                </Field>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="type-h2 text-ink">2 · Videos and images</h2>
            <span className="type-small text-ink-muted">
              {items.length} / {MAX_CREATIVES}
            </span>
          </div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              void addFiles(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center gap-2 rounded-md border-2 border-dashed px-4 py-8 text-center transition-hover ${drag ? "border-brand bg-brand-soft" : "border-line"}`}
          >
            <Upload aria-hidden size={22} strokeWidth={1.5} className="text-ink-muted" />
            <p className="type-body text-ink">Drop up to {MAX_CREATIVES} videos (MP4, MOV) or images (JPG, PNG)</p>
            <p className="type-small text-ink-muted">Up to 200 MB each. Tall 9:16 videos work everywhere.</p>
            <Button variant="secondary" size="sm" onClick={() => input.current?.click()} disabled={items.length >= MAX_CREATIVES}>
              Choose files
            </Button>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              multiple
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          {fe("creatives") ? <p className="type-small text-danger">{fe("creatives")}</p> : null}
          {items.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {items.map((c, i) => {
                const notes = tpl ? mediaNotes(c, tpl.platforms) : [];
                return (
                  <li key={c.id} className="flex gap-3 rounded-md border border-line p-3">
                    <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-sunk">
                      <Thumb kind={c.kind} src={c.preview} />
                      <span className="absolute top-1 left-1 rounded-full bg-brand px-1.5 type-caption text-on-brand">#{i + 1}</span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Input aria-label={`Name of creative ${i + 1}`} value={c.name} maxLength={120} onChange={(e) => setItems((x) => x.map((y) => (y.id === c.id ? { ...y, name: e.target.value } : y)))} className="h-8" />
                        <button
                          type="button"
                          onClick={() => {
                            URL.revokeObjectURL(c.preview);
                            setItems((x) => x.filter((y) => y.id !== c.id));
                          }} className="rounded-full p-1 text-ink-muted hover:text-ink focus-visible:focus-ring">
                          <X aria-hidden size={16} strokeWidth={1.75} />
                          <span className="sr-only">Remove {c.name}</span>
                        </button>
                      </div>
                      <p className="flex items-center gap-1.5 type-small text-ink-muted">
                        {c.kind === "video" ? <FileVideo aria-hidden size={14} /> : <ImageIcon aria-hidden size={14} />}
                        {c.width && c.height ? `${c.width}×${c.height}` : ""}
                        {c.duration ? ` · ${c.duration}s` : ""} · {(c.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                      {c.status === "uploading" ? (
                        <p className="flex items-center gap-1.5 type-small text-brand">
                          <LoaderCircle aria-hidden size={14} className="animate-spin" /> Uploading…
                        </p>
                      ) : c.status === "error" ? (
                        <p className="type-small text-danger">{c.error}</p>
                      ) : (
                        <p className="flex items-center gap-1.5 type-small text-success">
                          <CheckCircle2 aria-hidden size={14} /> Uploaded
                        </p>
                      )}
                      {notes.map((n) => (
                        <p key={n} className="type-small text-warning">
                          {n}
                        </p>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-4">
          <h2 className="type-h2 text-ink">3 · Template</h2>
          <Field label="Template" error={fe("template_id")} hint={tpl ? `${presetLabel(tpl.structure.preset)} · ${tpl.platforms.map((p) => PLATFORM_LONG[p]).join(" + ")}` : undefined} required>
            <Select
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                setO({});
              }}
              options={templates.map((t) => ({ value: t.id, label: t.data.name }))}
            />
          </Field>
          {tpl && (canChange("budget") || canChange("start")) ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {canChange("budget") && tpl.structure.adsets.mode === "new" ? (
                <Field label={`Budget (${account.currency})`} hint={`Template: ${money(mainBudget(tpl.structure), account.currency)}; up to +${tpl.structure.budget.boost_pct_max}%`} error={fe("budget")}>
                  <Input inputMode="decimal" placeholder={String(mainBudget(tpl.structure) ?? "")} value={o.budget ?? ""} onChange={(e) => setO({ ...o, budget: e.target.value ? Number(e.target.value.replace(/,/g, "")) : null })} />
                </Field>
              ) : null}
              {canChange("budget") && tpl.platforms.includes("tiktok") && tpl.structure.adsets.mode === "new" ? (
                <Field label={`TikTok budget (${account.currency})`} error={fe("tiktok_budget")}>
                  <Input inputMode="decimal" value={o.tiktok_budget ?? ""} onChange={(e) => setO({ ...o, tiktok_budget: e.target.value ? Number(e.target.value.replace(/,/g, "")) : null })} />
                </Field>
              ) : null}
              {canChange("start") ? (
                <Field label="Start">
                  <Select
                    value={o.start ?? tpl.schedule.start}
                    onChange={(e) => setO({ ...o, start: e.target.value as Overrides["start"], start_hours: e.target.value === "in_hours" ? (o.start_hours ?? 2) : null })}
                    options={[
                      { value: "immediate", label: "As soon as it's ready" },
                      { value: "next_day", label: "Tomorrow at midnight" },
                      { value: "in_hours", label: "In a few hours" },
                    ]}
                  />
                </Field>
              ) : null}
              {canChange("start") && (o.start ?? tpl.schedule.start) === "in_hours" ? (
                <Field label="Hours">
                  <Input inputMode="numeric" value={o.start_hours ?? tpl.schedule.hours ?? 2} onChange={(e) => setO({ ...o, start_hours: Number(e.target.value.replace(/\D/g, "")) || 1 })} />
                </Field>
              ) : null}
            </div>
          ) : null}
          {tpl && canChange("copy") ? (
            <details className="flex flex-col gap-3">
              <summary className="cursor-pointer type-label text-brand">Change the ad text for this launch</summary>
              <div className="mt-3 flex flex-col gap-3">
                <Field label="Main text" error={fe("copy.primary_text")}>
                  <Textarea rows={3} value={o.copy?.primary_text ?? tpl.copy.primary_text} onChange={(e) => setO({ ...o, copy: { ...o.copy, primary_text: e.target.value } })} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Headline">
                    <Input value={o.copy?.headline ?? tpl.copy.headline} onChange={(e) => setO({ ...o, copy: { ...o.copy, headline: e.target.value } })} />
                  </Field>
                  {tpl.objective !== "messages" ? (
                    <Field label="Button">
                      <Select value={o.copy?.cta ?? tpl.copy.cta} onChange={(e) => setO({ ...o, copy: { ...o.copy, cta: e.target.value } })} options={CTAS[tpl.objective]} />
                    </Field>
                  ) : null}
                </div>
                {tpl.platforms.includes("tiktok") ? (
                  <Field label="TikTok text" error={fe("copy.tiktok_text")}>
                    <Input maxLength={100} value={o.copy?.tiktok_text ?? tpl.copy.tiktok_text} onChange={(e) => setO({ ...o, copy: { ...o.copy, tiktok_text: e.target.value } })} />
                  </Field>
                ) : null}
              </div>
            </details>
          ) : null}
        </Card>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <Card className="flex flex-col gap-4">
          <h2 className="type-h3 text-ink">What will be made</h2>
          {!preview ? (
            <p className="type-small text-ink-muted">Pick a product and a template.</p>
          ) : (
            <>
              {preview.platforms.map((p) => (
                <div key={p.platform} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={p.skipped ? "neutral" : "brand"}>{PLATFORM_LONG[p.platform]}</Badge>
                    <span className="type-label text-ink">
                      {p.daily > 0 ? `${money(p.daily, account.currency)}/day` : ""}
                      {p.platform === "meta" && adIds.length > 1 && p.daily > 0 ? ` × ${adIds.length} accounts` : ""}
                    </span>
                  </div>
                  <p className="type-small text-ink-muted">{p.summary}</p>
                  {!p.skipped && items.length ? <Tree nodes={preview.nodes} platform={p.platform} currency={account.currency} /> : null}
                </div>
              ))}
              {items.length && product ? (
                <div className="rounded-md bg-surface-sunk p-3">
                  <p className="type-caption text-ink-muted">Ad text</p>
                  <p className="line-clamp-4 type-small whitespace-pre-line text-ink">{fillCopy(preview.template.copy.primary_text, { name: product.name, form_name: usedName, price: product.price, details: product.details, about: product.about }, account.currency)}</p>
                </div>
              ) : null}
            </>
          )}
        </Card>
        {preview?.errors.length ? (
          <Alert tone="danger" title="To fix before launching">
            <ul className="flex list-disc flex-col gap-1 pl-4">
              {preview.errors.slice(0, 6).map((e) => (
                <li key={e.field + e.message}>{e.message}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        {preview?.warnings.length ? (
          <Alert tone="warning" title="Good to know">
            <ul className="flex list-disc flex-col gap-1 pl-4">
              {preview.warnings.slice(0, 6).map((e) => (
                <li key={e.field + e.message}>{e.message}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        <Button onClick={launch} loading={busy} disabled={blocked || busy} fullWidth size="lg">
          <Rocket aria-hidden size={18} strokeWidth={1.75} /> {uploading ? "Uploading…" : "Launch"}
        </Button>
        <p className="text-center type-small text-ink-muted">Everything is made paused and switched on only at the end. Nothing spends before that.</p>
      </aside>
    </div>
  );
}
