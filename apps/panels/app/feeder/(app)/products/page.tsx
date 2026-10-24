import { PageHeader } from "@retexia/ui/admin";
import { MyProducts } from "@/components/feeder/my-products";
import { requireFeederPage } from "@/lib/feeder/access";
import { catalog, mySetup } from "@/lib/feeder/data";

export const metadata = { title: "My products" };

export default async function FeederProductsPage() {
  const { user } = await requireFeederPage("/products");
  const [list, setup] = await Promise.all([catalog(), mySetup(user.id)]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="My products" description="The Feeder products you sell, your form names for each, and your own selling price. Bulk import uses these to match every lead." />
      <MyProducts catalog={list} mine={setup.products} />
    </div>
  );
}
