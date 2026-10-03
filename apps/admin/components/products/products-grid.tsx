"use client";

import { Badge, Button, Card, Dialog, Field, Input, formatPrice } from "@retexia/ui";
import { SortableList } from "@retexia/ui/admin";
import { Copy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { duplicateProduct, reorder } from "@/app/(panel)/products/actions";
import { ProductIcon } from "./product-icon";
import { slugify } from "./package-editor";

export type ProductCardRow = {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  code: string;
  icon: string | null;
  status: string;
  tagline: string | null;
  packages: number;
  open: number;
  active: number;
  mrr: number;
  waitlist: number;
};

const statusBadge: Record<string, { tone: "success" | "warning" | "neutral"; label: string }> = {
  live: { tone: "success", label: "Live" },
  coming_soon: { tone: "warning", label: "Coming soon" },
  hidden: { tone: "neutral", label: "Hidden" },
};

export function ProductsGrid({ products, currency, canManage }: { products: ProductCardRow[]; currency: string; canManage: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(products);
  const [dup, setDup] = useState<ProductCardRow | null>(null);
  const [dupName, setDupName] = useState("");
  const [dupSlug, setDupSlug] = useState("");
  const [busy, setBusy] = useState(false);

  const card = (p: ProductCardRow, handle?: React.ReactNode) => (
    <Card className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {handle}
          <span className="flex size-10 items-center justify-center rounded-md" style={{ color: `var(--product-${p.slug})`, background: `var(--product-${p.slug}-soft)` }}>
            <ProductIcon name={p.icon} />
          </span>
          <div className="flex flex-col">
            <Link href={`/products/${p.slug}`} className="type-h3 text-ink hover:text-brand focus-visible:focus-ring">
              {p.name}
            </Link>
            <span className="type-small text-ink-muted">
              /{p.slug} · {p.code}
            </span>
          </div>
        </div>
        <Badge tone={statusBadge[p.status]?.tone ?? "neutral"}>{statusBadge[p.status]?.label ?? p.status}</Badge>
      </div>
      {p.tagline ? <p className="type-body text-ink-muted">{p.tagline}</p> : null}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Open requests", p.open],
          ["Active", p.active],
          ["MRR", formatPrice(p.mrr, currency)],
          [p.packages ? "Packages" : "Waitlist", p.packages || p.waitlist],
        ].map(([k, v]) => (
          <div key={String(k)} className="flex flex-col gap-0.5">
            <dt className="type-small text-ink-muted">{k}</dt>
            <dd className="type-label text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto flex flex-wrap gap-2">
        <Button href={`/products/${p.slug}`} size="sm" variant="secondary">
          Open
        </Button>
        <Button href={`/requests?product=${p.slug}`} size="sm" variant="ghost">
          Requests
        </Button>
        {canManage ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<Copy aria-hidden size={14} strokeWidth={1.5} />}
            onClick={() => {
              setDup(p);
              setDupName(`${p.name} copy`);
              setDupSlug(`${p.slug}-copy`);
            }}
          >
            Duplicate
          </Button>
        ) : null}
      </div>
    </Card>
  );

  return (
    <>
      {canManage ? (
        <SortableList
          items={items}
          getId={(p) => p.id}
          getLabel={(p) => p.name}
          className="grid gap-4 lg:grid-cols-2"
          onReorder={async (ids) => {
            const next = ids.map((id) => items.find((p) => p.id === id)!);
            setItems(next);
            const r = await reorder({ table: "products", ids });
            toast[r.ok ? "success" : "error"](r.message ?? "");
            if (!r.ok) setItems(products);
          }}
          renderItem={(p, handle) => card(p, handle)}
        />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {items.map((p) => (
            <li key={p.id}>{card(p)}</li>
          ))}
        </ul>
      )}
      <Dialog
        open={Boolean(dup)}
        onOpenChange={(o) => !o && setDup(null)}
        title={`Duplicate ${dup?.name ?? ""}`}
        description="Copies packages, the page, the onboarding form, service fields and actions. The copy starts hidden; requests and customers are not copied."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDup(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                if (!dup) return;
                setBusy(true);
                const r = await duplicateProduct({ productId: dup.id, slug: dupSlug, name: dupName });
                setBusy(false);
                if (!r.ok) return toast.error(r.message);
                toast.success(r.message ?? "Copied");
                setDup(null);
                router.push(`/products/${r.data}`);
              }}
            >
              Duplicate
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="New name" required>
            <Input value={dupName} onChange={(e) => setDupName(e.target.value)} />
          </Field>
          <Field label="Web address" hint={`retexia.com/${dupSlug}`} required>
            <Input value={dupSlug} onChange={(e) => setDupSlug(slugify(e.target.value))} />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
