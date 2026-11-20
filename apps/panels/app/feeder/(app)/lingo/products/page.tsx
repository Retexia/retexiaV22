import { Alert, Badge, Button, Card, EmptyState } from "@retexia/ui";
import { CircleAlert, Package, TriangleAlert } from "lucide-react";
import { lingoContext, products } from "@/lib/feeder/lingo/data";
import { imageOk, productIssues } from "@/lib/feeder/lingo/health";
import { money } from "@/lib/feeder/lingo/labels";

export const metadata = { title: "Products · Lingo" };

export default async function LingoProducts() {
  const { ctx } = await lingoContext("/lingo/products");
  if (!ctx) return null;
  const list = await products(ctx.id);
  const photos = await Promise.all(list.map((p) => imageOk(p.image_url)));
  const rows = list.map((p, i) => ({ p, issues: productIssues(p, photos[i]!) }));
  const bad = rows.filter((r) => r.issues.some((i) => i.level === "danger")).length;

  if (!list.length)
    return (
      <EmptyState icon={<Package aria-hidden size={22} strokeWidth={1.5} />} title="No products yet" actions={<Button href="/products">Open My products</Button>}>
        Lingo uses your Feeder products. Add the products you sell in My products and they appear here with their photos and details.
      </EmptyState>
    );

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="info" title="Your products, from My products">
        Photos, descriptions, usage and precautions come from Retexia&apos;s shared content for each Feeder product, and prices from your price list. Change anything for your shop on a product: your text wins.{" "}
        {bad ? `${bad} product${bad === 1 ? " needs" : "s need"} a fix before customers see it.` : "Everything looks ready."}
      </Alert>
      <ul className="flex flex-col gap-3">
        {rows.map(({ p, issues }) => (
          <li key={p.id}>
            <Card className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="size-16 shrink-0 overflow-hidden rounded-md border border-line bg-surface-sunk">
                {/* eslint-disable-next-line @next/next/no-img-element -- public product photo */}
                {p.image_url ? <img src={p.image_url} alt="" className="size-full object-cover" /> : null}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="type-label text-ink">{p.name}</span>
                  {!p.active ? <Badge tone="neutral">Off</Badge> : null}
                  {p.feeder_id ? <Badge tone="neutral">Item {p.feeder_id}</Badge> : null}
                </p>
                <p className="type-small text-ink-muted">
                  {money(p.price)} + delivery {money(p.delivery_fee)} · {p.faqs} FAQ{p.faqs === 1 ? "" : "s"} · {p.ads} ad{p.ads === 1 ? "" : "s"}
                </p>
                {issues.length ? (
                  <ul className="flex flex-col gap-1 pt-1">
                    {issues.map((i) => (
                      <li key={i.text} className={`flex items-start gap-1.5 type-small ${i.level === "danger" ? "text-danger" : "text-ink-muted"}`}>
                        {i.level === "danger" ? <CircleAlert aria-hidden size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" /> : <TriangleAlert aria-hidden size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warning" />}
                        {i.text}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="type-small text-success">Ready</p>
                )}
              </div>
              <Button size="sm" variant="secondary" href={`/lingo/products/${p.id}`}>Edit</Button>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
