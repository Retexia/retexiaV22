"use client";

import { Badge, Button, Card, Dialog, Field, Input, Select, formatDate } from "@retexia/ui";
import { ConfirmDialog } from "@retexia/ui/admin";
import { Copy, ExternalLink, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deletePage, duplicatePage, savePage } from "@/app/(panel)/website/actions";

type PageItem = {
  id: string;
  slug: string;
  title: string;
  is_published: boolean;
  show_in_sitemap: boolean;
  seo_ok: boolean;
  sections: number;
  updated_at: string;
  product: string | null;
  usedByProduct: boolean;
};

const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export function PagesList({ pages, products, webUrl, canDelete }: { pages: PageItem[]; products: { id: string; name: string }[]; webUrl: string; canDelete: boolean }) {
  const router = useRouter();
  const [create, setCreate] = useState<{ mode: "new" | "copy"; from?: PageItem; title: string; slug: string; product_id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState<PageItem | null>(null);

  const submit = async () => {
    if (!create) return;
    setBusy(true);
    const r =
      create.mode === "copy" && create.from
        ? await duplicatePage({ id: create.from.id, slug: create.slug, title: create.title })
        : await savePage({ slug: create.slug, title: create.title, seo_title: "", seo_description: "", og_image_url: "", is_published: false, show_in_sitemap: true, product_id: create.product_id || null });
    setBusy(false);
    if (!r.ok) return toast.error(r.message);
    toast.success(r.message ?? "Created");
    router.push(`/website/pages/${r.data}`);
  };

  return (
    <>
      <div className="flex justify-end">
        <Button icon={<Plus aria-hidden size={16} strokeWidth={1.5} />} onClick={() => setCreate({ mode: "new", title: "", slug: "", product_id: "" })}>
          New page
        </Button>
      </div>
      <Card padded={false}>
        <ul className="divide-y divide-line">
          {pages.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <Link href={`/website/pages/${p.id}`} className="type-label text-ink hover:text-brand">
                    {p.title}
                  </Link>
                  <span className="type-code text-ink-muted">/{p.slug}</span>
                  {p.is_published ? <Badge tone="success">Published</Badge> : <Badge tone="neutral">Draft</Badge>}
                  {p.product ? <Badge tone="brand">{p.product}</Badge> : null}
                  {!p.seo_ok ? <Badge tone="warning">No search description</Badge> : null}
                  {!p.show_in_sitemap ? <Badge tone="neutral">Not in sitemap</Badge> : null}
                </span>
                <span className="type-small text-ink-muted">
                  {p.sections} sections · updated {formatDate(p.updated_at)}
                </span>
              </div>
              <div className="flex gap-1">
                <Button href={`/website/pages/${p.id}`} size="sm" variant="secondary">
                  Edit
                </Button>
                <Button href={`${webUrl}/${p.slug}`} target="_blank" size="sm" variant="ghost" icon={<ExternalLink aria-hidden size={14} strokeWidth={1.5} />}>
                  <span className="sr-only">Open {p.title} on the website</span>
                </Button>
                <Button size="sm" variant="ghost" icon={<Copy aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setCreate({ mode: "copy", from: p, title: `${p.title} copy`, slug: `${p.slug || "home"}-copy`, product_id: "" })}>
                  <span className="sr-only">Duplicate {p.title}</span>
                </Button>
                {canDelete && p.slug !== "" ? (
                  <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setRemove(p)}>
                    <span className="sr-only">Delete {p.title}</span>
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Dialog
        open={Boolean(create)}
        onOpenChange={(o) => !o && setCreate(null)}
        title={create?.mode === "copy" ? `Duplicate ${create.from?.title}` : "New page"}
        description={create?.mode === "copy" ? "Copies every section. The copy starts as a draft." : "Starts empty and unpublished. Add sections, then publish."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreate(null)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={submit}>
              {create?.mode === "copy" ? "Duplicate" : "Create page"}
            </Button>
          </>
        }
      >
        {create ? (
          <div className="flex flex-col gap-4">
            <Field label="Page name" required>
              <Input autoFocus value={create.title} onChange={(e) => setCreate({ ...create, title: e.target.value, slug: create.slug && create.slug !== toSlug(create.title) ? create.slug : toSlug(e.target.value) })} />
            </Field>
            <Field label="Web address" hint={`${webUrl}/${create.slug}`} required>
              <Input value={create.slug} onChange={(e) => setCreate({ ...create, slug: toSlug(e.target.value) })} />
            </Field>
            {create.mode === "new" ? (
              <Field label="Product" optionalLabel="Optional">
                <Select value={create.product_id} onChange={(e) => setCreate({ ...create, product_id: e.target.value })} options={products.map((p) => ({ value: p.id, label: p.name }))} placeholder="None" />
              </Field>
            ) : null}
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={Boolean(remove)}
        onOpenChange={(o) => !o && setRemove(null)}
        title={`Delete ${remove?.title}?`}
        description={remove?.usedByProduct ? "A product uses this page; pick another page for that product first." : "The page and its sections are deleted. Links to it will show “not found”."}
        confirmLabel="Delete page"
        confirmText={remove?.slug}
        onConfirm={async () => {
          if (!remove) return;
          const r = await deletePage({ id: remove.id });
          toast[r.ok ? "success" : "error"](r.message ?? "");
          setRemove(null);
          if (r.ok) router.refresh();
        }}
      />
    </>
  );
}
