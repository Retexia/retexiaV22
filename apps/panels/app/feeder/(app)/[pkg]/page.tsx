import { Alert, Button, Card } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import { Lock } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { BulkImportV2 } from "@/components/feeder/bulk-import-v2";
import { requireFeederPage } from "@/lib/feeder/access";
import { mySetup } from "@/lib/feeder/data";
import { toolFor } from "@/lib/feeder/tools";

export async function generateMetadata({ params }: { params: Promise<{ pkg: string }> }) {
  return { title: (await params).pkg.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()) };
}

/** One package: its tool when bought, otherwise locked. */
export default async function FeederPackagePage({ params }: { params: Promise<{ pkg: string }> }) {
  const { pkg } = await params;
  const { packages, buyUrl, user } = await requireFeederPage(`/${pkg}`);
  const p = packages.find((x) => x.slug === pkg);
  if (!p) notFound();

  if (!p.owned) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={p.name} description={p.tagline ?? undefined} />
        <Card className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-surface-sunk text-ink-muted">
            <Lock aria-hidden size={22} strokeWidth={1.5} />
          </span>
          <h2 className="type-h2 text-ink">{p.name} is locked</h2>
          <p className="max-w-md type-body text-ink-muted">It isn&apos;t part of your packages yet. Add it to your account and it opens here, next to the packages you already have.</p>
          <Button href={buyUrl(p.slug)} target="_self">
            Get {p.name}
          </Button>
        </Card>
      </div>
    );
  }

  const tool = toolFor(p.slug);
  const setup = tool ? await mySetup(user.id) : null;
  if (tool && !setup?.customer) redirect("/setup");
  const count = setup?.products.length ?? 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={p.name} description={p.tagline ?? undefined} />
      {tool === "bulk-import-v2" ? (
        <BulkImportV2 productCount={count} crmLinks={setup?.customer?.crm_links ?? []} />
      ) : (
        <Alert tone="info" title="We're setting this up">
          {p.name} is on your account{p.orderRef ? ` (request ${p.orderRef})` : ""}. It opens here as soon as it&apos;s ready; we&apos;ll message you.
        </Alert>
      )}
    </div>
  );
}
