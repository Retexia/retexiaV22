"use client";

import { sectionCatalog, sectionTypes, type SectionType } from "@retexia/content";
import { Alert, Badge, Button, Card, Dialog, Field, Input, Select, Switch, Tabs, Textarea, cn } from "@retexia/ui";
import { ConfirmDialog, SortableList, useUnsavedChanges } from "@retexia/ui/admin";
import { Copy, ExternalLink, Eye, EyeOff, Plus, RefreshCw, Trash2 } from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { deleteContent, duplicateSection, reorderContent, savePage, saveSection } from "@/app/(panel)/website/actions";
import { MediaInput } from "./media-picker";
import { SchemaForm, type JsonSchema } from "./schema-form";

export type SectionRow = {
  id: string;
  type: string;
  eyebrow: string;
  title: string;
  highlight: string;
  subtitle: string;
  anchor: string;
  background: "surface" | "sunk";
  content: Record<string, unknown>;
  is_visible: boolean;
};
export type PageValue = {
  id: string;
  slug: string;
  title: string;
  seo_title: string;
  seo_description: string;
  og_image_url: string;
  is_published: boolean;
  show_in_sitemap: boolean;
  product_id: string;
};

export function PageEditor({
  page: initialPage,
  sections: initialSections,
  schemas,
  products,
  webUrl,
  siteName,
  titleTemplate,
}: {
  page: PageValue;
  sections: SectionRow[];
  schemas: Record<string, JsonSchema>;
  products: { id: string; slug: string; name: string }[];
  webUrl: string;
  siteName: string;
  titleTemplate: string;
}) {
  const router = useRouter();
  const [page, setPage] = useState(initialPage);
  const [sections, setSections] = useState(initialSections);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<SectionRow | null>(null);
  const [view, setView] = useState<"section" | "page" | "preview">("preview");
  const [mode, setMode] = useState("form");
  const [json, setJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [remove, setRemove] = useState<SectionRow | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");

  const original = sections.find((s) => s.id === selected) ?? null;
  const sectionDirty = Boolean(draft && original && JSON.stringify(draft) !== JSON.stringify(original));
  const pageDirty = JSON.stringify(page) !== JSON.stringify(initialPage);
  useUnsavedChanges(sectionDirty || pageDirty);

  const path = page.slug ? `/${page.slug}` : "/";
  const previewUrl = `${webUrl}${path}`;
  const seoTitle = page.seo_title || titleTemplate.replace("%s", page.title);

  const open = (s: SectionRow) => {
    if (sectionDirty && !window.confirm("Discard changes to the open section?")) return;
    setSelected(s.id);
    setDraft(structuredClone(s));
    setJson(JSON.stringify(s.content, null, 2));
    setJsonError(null);
    setErrors({});
    setMode("form");
    setView("section");
  };

  const saveDraft = async () => {
    if (!draft) return;
    let content = draft.content;
    if (mode === "json") {
      try {
        content = JSON.parse(json) as Record<string, unknown>;
      } catch {
        setJsonError("This is not valid JSON.");
        return;
      }
    }
    setBusy(true);
    const r = await saveSection({ ...draft, page_id: page.id, content });
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      return toast.error(r.message);
    }
    const saved = { ...draft, content };
    setSections((all) => all.map((s) => (s.id === draft.id ? saved : s)));
    setDraft(saved);
    setErrors({});
    toast.success(r.message ?? "Saved");
    setFrameKey((k) => k + 1);
    router.refresh();
  };

  const add = async (type: SectionType) => {
    const info = sectionCatalog[type];
    setGallery(false);
    const row = {
      page_id: page.id,
      type,
      eyebrow: info.defaults.eyebrow ?? "",
      title: info.defaults.title ?? "",
      highlight: info.defaults.highlight ?? "",
      subtitle: info.defaults.subtitle ?? "",
      anchor: sections.some((s) => s.anchor === info.defaults.anchor) ? "" : (info.defaults.anchor ?? ""),
      background: info.defaults.background ?? "surface",
      content: structuredClone(info.content) as Record<string, unknown>,
      is_visible: true,
    };
    const r = await saveSection(row);
    if (!r.ok || !r.data) return toast.error(r.ok ? "Could not add" : r.message);
    const created: SectionRow = { ...row, id: r.data, background: row.background as "surface" | "sunk" };
    setSections((all) => [...all, created]);
    toast.success(`${info.label} section added at the end`);
    open(created);
    setFrameKey((k) => k + 1);
  };

  const toggleVisible = async (s: SectionRow) => {
    const r = await saveSection({ ...s, page_id: page.id, is_visible: !s.is_visible });
    if (!r.ok) return toast.error(r.message);
    setSections((all) => all.map((x) => (x.id === s.id ? { ...x, is_visible: !s.is_visible } : x)));
    if (draft?.id === s.id) setDraft({ ...draft, is_visible: !s.is_visible });
    setFrameKey((k) => k + 1);
  };

  const savePageSettings = async () => {
    setBusy(true);
    const r = await savePage({ ...page, product_id: page.product_id || null });
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      return toast.error(r.message);
    }
    toast.success(r.message ?? "Saved");
    setFrameKey((k) => k + 1);
    router.refresh();
  };

  const schema = draft ? schemas[draft.type] : undefined;
  const highlightMissing = Boolean(draft?.highlight && draft.title && !draft.title.includes(draft.highlight));
  const anchors = useMemo(() => sections.filter((s) => s.anchor).map((s) => s.anchor), [sections]);

  return (
    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="type-h3 text-ink">Sections</h2>
            <Button size="sm" icon={<Plus aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setGallery(true)}>
              Add
            </Button>
          </div>
          {sections.length ? (
            <SortableList
              items={sections}
              getId={(s) => s.id}
              getLabel={(s) => s.title || s.type}
              className="flex flex-col gap-1.5"
              onReorder={async (ids) => {
                setSections(ids.map((i) => sections.find((s) => s.id === i)!));
                const r = await reorderContent({ table: "page_sections", ids });
                if (!r.ok) toast.error(r.message);
                else setFrameKey((k) => k + 1);
              }}
              renderItem={(s, handle) => {
                const info = sectionCatalog[s.type as SectionType];
                return (
                  <div className={cn("flex items-center gap-1 rounded-md border px-1 py-1.5", selected === s.id && view === "section" ? "border-brand ring-1 ring-brand" : "border-line", !s.is_visible && "opacity-60")}>
                    {handle}
                    <button type="button" onClick={() => open(s)} className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:focus-ring">
                      <DynamicIcon name={(info?.icon ?? "square") as IconName} size={16} strokeWidth={1.5} className="shrink-0 text-ink-muted" aria-hidden />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate type-label text-ink">{s.title || info?.label || s.type}</span>
                        <span className="type-small text-ink-muted">
                          {info?.label ?? s.type}
                          {s.anchor ? ` · #${s.anchor}` : ""}
                        </span>
                      </span>
                    </button>
                    <IconButton label={s.is_visible ? "Hide section" : "Show section"} onClick={() => toggleVisible(s)}>
                      {s.is_visible ? <Eye aria-hidden size={14} strokeWidth={1.5} /> : <EyeOff aria-hidden size={14} strokeWidth={1.5} />}
                    </IconButton>
                  </div>
                );
              }}
            />
          ) : (
            <p className="type-body text-ink-muted">No sections yet. Add the first one.</p>
          )}
        </Card>
        <Card className="flex flex-col gap-2">
          <Button variant={view === "page" ? "primary" : "secondary"} size="sm" onClick={() => setView("page")}>
            Page settings and SEO
          </Button>
          <Button variant={view === "preview" ? "primary" : "ghost"} size="sm" onClick={() => setView("preview")}>
            Preview
          </Button>
          <Button href={previewUrl} target="_blank" variant="ghost" size="sm" iconAfter={<ExternalLink aria-hidden size={14} strokeWidth={1.5} />}>
            Open on website
          </Button>
        </Card>
      </div>

      <div className="min-w-0">
        {view === "section" && draft ? (
          <Card className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge tone="brand">{sectionCatalog[draft.type as SectionType]?.label ?? draft.type}</Badge>
                {!draft.is_visible ? <Badge tone="neutral">Hidden</Badge> : null}
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Copy aria-hidden size={14} strokeWidth={1.5} />}
                  onClick={async () => {
                    const r = await duplicateSection({ id: draft.id });
                    toast[r.ok ? "success" : "error"](r.message ?? "");
                    if (!r.ok || !r.data || !original) return;
                    const copy: SectionRow = { ...structuredClone(original), id: r.data, anchor: "", is_visible: false };
                    setSections((all) => {
                      const next = [...all];
                      next.splice(next.findIndex((s) => s.id === original.id) + 1, 0, copy);
                      return next;
                    });
                    open(copy);
                  }}
                >
                  Duplicate
                </Button>
                <Button size="sm" variant="ghost" className="text-danger!" icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setRemove(draft)}>
                  Delete
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Small label above the title" optionalLabel="Optional">
                <Input value={draft.eyebrow} onChange={(e) => setDraft({ ...draft, eyebrow: e.target.value })} />
              </Field>
              <Field label="Link name (#anchor)" hint={draft.anchor ? `${path}#${draft.anchor}` : "Lets buttons jump to this section."} error={errors.anchor ?? (draft.anchor && anchors.filter((a) => a === draft.anchor).length > (original?.anchor === draft.anchor ? 1 : 0) ? "Another section uses this name." : null)} optionalLabel="Optional">
                <Input value={draft.anchor} onChange={(e) => setDraft({ ...draft, anchor: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
              </Field>
              <Field label="Title" optionalLabel="Optional" className="sm:col-span-2">
                <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </Field>
              <Field label="Highlighted words" hint="Part of the title shown in the accent colour." error={errors.highlight ?? (highlightMissing ? "Not found in the title." : null)} optionalLabel="Optional">
                <Input value={draft.highlight} onChange={(e) => setDraft({ ...draft, highlight: e.target.value })} />
              </Field>
              <Field label="Background">
                <Select value={draft.background} onChange={(e) => setDraft({ ...draft, background: e.target.value === "sunk" ? "sunk" : "surface" })} options={[{ value: "surface", label: "Plain" }, { value: "sunk", label: "Tinted" }]} />
              </Field>
              <Field label="Intro text" optionalLabel="Optional" className="sm:col-span-2">
                <Textarea rows={2} value={draft.subtitle} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} />
              </Field>
            </div>

            {schema && Object.keys(schema.properties ?? {}).length ? (
              <div className="flex flex-col gap-4 border-t border-line pt-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="type-label text-ink">Section settings</h3>
                  <Tabs
                    idPrefix="section-mode"
                    label="Editor mode"
                    value={mode}
                    onValueChange={(m) => {
                      if (m === "json") setJson(JSON.stringify(draft.content, null, 2));
                      else {
                        try {
                          setDraft({ ...draft, content: JSON.parse(json) as Record<string, unknown> });
                          setJsonError(null);
                        } catch {
                          setJsonError("This is not valid JSON. Fix it before switching back.");
                          return;
                        }
                      }
                      setMode(m);
                    }}
                    items={[
                      { value: "form", label: "Form" },
                      { value: "json", label: "JSON" },
                    ]}
                  />
                </div>
                {Object.entries(errors).filter(([k]) => k.startsWith("content")).length ? (
                  <Alert tone="danger" title="Check these settings">
                    {Object.entries(errors)
                      .filter(([k]) => k.startsWith("content"))
                      .map(([k, v]) => `${k.replace(/^content\.?/, "") || "content"}: ${v}`)
                      .join(" · ")}
                  </Alert>
                ) : null}
                {mode === "form" ? (
                  <SchemaForm schema={schema} value={draft.content} onChange={(content) => setDraft({ ...draft, content })} products={products} errors={errors} />
                ) : (
                  <Field label="Content (JSON)" error={jsonError} hint="Advanced: the raw settings. Checked against the section's schema when you save.">
                    <Textarea rows={16} className="font-mono text-[13px]" value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
                  </Field>
                )}
              </div>
            ) : null}

            <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-full border border-line bg-surface-raised/95 px-4 py-2 shadow-float backdrop-blur">
              <Switch checked={draft.is_visible} onCheckedChange={(v) => setDraft({ ...draft, is_visible: v })} label="Visible" />
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={!sectionDirty} onClick={() => original && open(original)}>
                  Discard
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setView("preview")}>
                  Preview
                </Button>
                <Button size="sm" loading={busy} disabled={!sectionDirty && mode === "form"} onClick={saveDraft}>
                  Save section
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        {view === "page" ? (
          <Card className="flex flex-col gap-5">
            <h2 className="type-h2 text-ink">Page settings</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Page name" required>
                <Input value={page.title} onChange={(e) => setPage({ ...page, title: e.target.value })} />
              </Field>
              <Field label="Web address" hint={initialPage.slug === "" ? "This is the home page." : `${webUrl}/${page.slug}`} error={errors.slug} required>
                <Input value={page.slug} disabled={initialPage.slug === ""} onChange={(e) => setPage({ ...page, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
              </Field>
              <Field label="Product" hint="Product pages use the product's colour." optionalLabel="Optional">
                <Select value={page.product_id} onChange={(e) => setPage({ ...page, product_id: e.target.value })} options={products.map((p) => ({ value: p.id, label: p.name }))} placeholder="None" />
              </Field>
              <div className="flex flex-col justify-end gap-3 pb-1">
                <Switch checked={page.is_published} onCheckedChange={(v) => setPage({ ...page, is_published: v })} label="Published" />
                <Switch checked={page.show_in_sitemap} onCheckedChange={(v) => setPage({ ...page, show_in_sitemap: v })} label="In the sitemap (search engines)" />
              </div>
            </div>
            <div className="flex flex-col gap-4 border-t border-line pt-4">
              <h3 className="type-label text-ink">Search and sharing</h3>
              <Field label="Search title" hint={`${page.seo_title.length}/60 · empty = “${titleTemplate.replace("%s", page.title)}”`} optionalLabel="Optional">
                <Input value={page.seo_title} maxLength={70} onChange={(e) => setPage({ ...page, seo_title: e.target.value })} />
              </Field>
              <Field label="Search description" hint={`${page.seo_description.length}/160`} optionalLabel="Optional">
                <Textarea rows={2} maxLength={170} value={page.seo_description} onChange={(e) => setPage({ ...page, seo_description: e.target.value })} />
              </Field>
              <Field label="Share image" hint="1200 × 630 works best. Empty = the site default." optionalLabel="Optional">
                <MediaInput value={page.og_image_url} onChange={(og_image_url) => setPage({ ...page, og_image_url })} />
              </Field>
              <div className="flex flex-col gap-1 rounded-md border border-line bg-surface-sunk/50 p-4" aria-label="Search result preview">
                <span className="type-small text-ink-muted">
                  {webUrl.replace(/^https?:\/\//, "")}
                  {path === "/" ? "" : path}
                </span>
                <span className="truncate text-[18px] leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">{seoTitle || siteName}</span>
                <span className="line-clamp-2 type-small text-ink-muted">{page.seo_description || "No description yet. Search engines will pick some text from the page."}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button loading={busy} disabled={!pageDirty} onClick={savePageSettings}>
                Save page
              </Button>
              <Button variant="ghost" disabled={!pageDirty} onClick={() => setPage(initialPage)}>
                Discard
              </Button>
            </div>
          </Card>
        ) : null}

        {view === "preview" ? (
          <Card padded={false} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
              <span className="truncate type-small text-ink-muted">{previewUrl}</span>
              <div className="flex items-center gap-1">
                <Tabs
                  idPrefix="preview-width"
                  label="Preview width"
                  value={width}
                  onValueChange={(v) => setWidth(v === "mobile" ? "mobile" : "desktop")}
                  items={[
                    { value: "desktop", label: "Desktop" },
                    { value: "mobile", label: "Phone" },
                  ]}
                />
                <IconButton label="Reload preview" onClick={() => setFrameKey((k) => k + 1)}>
                  <RefreshCw aria-hidden size={14} strokeWidth={1.5} />
                </IconButton>
              </div>
            </div>
            {!page.is_published ? <Alert tone="warning" className="m-4">This page is not published, so the website shows “not found” until you publish it.</Alert> : null}
            <div className="flex justify-center bg-surface-sunk p-3">
              <iframe
                key={frameKey}
                title="Website preview"
                src={`${previewUrl}${previewUrl.includes("?") ? "&" : "?"}_preview=${frameKey}`}
                className={cn("h-[75vh] rounded-md border border-line bg-surface", width === "mobile" ? "w-[390px]" : "w-full")}
              />
            </div>
          </Card>
        ) : null}
      </div>

      <Dialog open={gallery} onOpenChange={setGallery} size="lg" title="Add a section" description="It's added at the end; drag it where you want it.">
        <ul className="grid gap-3 sm:grid-cols-2">
          {sectionTypes.map((t) => {
            const info = sectionCatalog[t];
            return (
              <li key={t}>
                <button type="button" onClick={() => add(t)} className="flex h-full w-full items-start gap-3 rounded-lg border border-line p-3 text-left transition-hover hover:border-brand hover:bg-brand-soft/30 focus-visible:focus-ring">
                  <DynamicIcon name={info.icon as IconName} size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-brand" aria-hidden />
                  <span className="flex flex-col gap-0.5">
                    <span className="type-label text-ink">{info.label}</span>
                    <span className="type-small text-ink-muted">{info.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Dialog>

      <ConfirmDialog
        open={Boolean(remove)}
        onOpenChange={(o) => !o && setRemove(null)}
        title="Delete this section?"
        description={`“${remove?.title || remove?.type}” is removed from the page. To keep it for later, hide it instead.`}
        confirmLabel="Delete section"
        onConfirm={async () => {
          if (!remove) return;
          const r = await deleteContent({ table: "page_sections", id: remove.id });
          toast[r.ok ? "success" : "error"](r.message ?? "");
          if (r.ok) {
            setSections((all) => all.filter((s) => s.id !== remove.id));
            setSelected(null);
            setDraft(null);
            setView("preview");
            setFrameKey((k) => k + 1);
          }
          setRemove(null);
        }}
      />
    </div>
  );
}

function IconButton({ label, children, onClick }: { label: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-hover hover:bg-surface-sunk hover:text-ink focus-visible:focus-ring">
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}
