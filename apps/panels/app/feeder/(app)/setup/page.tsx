import { Card } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import { CrmLinks } from "@/components/feeder/crm-links";
import { MyProducts } from "@/components/feeder/my-products";
import { SetupWizard } from "@/components/feeder/setup-wizard";
import { requireFeederPage } from "@/lib/feeder/access";
import { catalog, mySetup } from "@/lib/feeder/data";
import { toolFor } from "@/lib/feeder/tools";

export const metadata = { title: "Set up Feeder" };

/** First visit: name, products with form names, CRM links (all saved to the customer's account). */
export default async function FeederSetupPage() {
  const { user, packages } = await requireFeederPage("/setup");
  const [list, setup] = await Promise.all([catalog(), mySetup(user.id)]);
  const tool = packages.find((p) => p.owned && toolFor(p.slug));
  const links = setup.customer?.crm_links ?? [];
  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6">
      <PageHeader title="Set up Feeder" description="A few minutes now and every courier file comes out right: tell us which products you sell and what your lead forms are called." />
      <SetupWizard
        initialName={setup.customer?.name ?? user.name}
        hasProducts={setup.products.length > 0}
        hasLinks={links.length > 0}
        next={tool ? `/${tool.slug}` : "/"}
        products={<MyProducts catalog={list} mine={setup.products} />}
        crm={
          <Card className="flex flex-col gap-3">
            <p className="type-body text-ink-muted">
              If you keep orders in a Google Sheet (your CRM), add its link. In the sheet: Share → General access → &quot;Anyone with the link&quot; → Viewer, open the orders tab, then copy the link.
            </p>
            <CrmLinks links={links} />
          </Card>
        }
      />
    </div>
  );
}
