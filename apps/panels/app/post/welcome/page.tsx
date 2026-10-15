import { Card } from "@retexia/ui";
import { redirect } from "next/navigation";
import { Centered } from "@/components/centered";
import { WelcomeForm } from "@/components/post/welcome-form";
import { orderPrefill } from "@/lib/post/order-prefill";
import { postDbConfigured } from "@/lib/post/post-db";
import { listBusinesses, requireCustomer } from "@/lib/post/session";

export const metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const customer = await requireCustomer("/welcome");
  if (!postDbConfigured()) {
    return (
      <Centered>
        <Card>
          <p className="type-body text-ink">Retexia Post is not connected to the database yet (SUPABASE_SERVICE_ROLE_KEY).</p>
        </Card>
      </Centered>
    );
  }
  if ((await listBusinesses(customer.id)).length) redirect("/");
  // What they already told us on the order form: shown for a one-click confirm, not asked again.
  const prefill = await orderPrefill(customer.order.id);
  return (
    <Centered>
      <Card className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="type-h1 text-ink">Welcome to Retexia Post</h1>
          <p className="type-body text-ink-muted">
            {prefill
              ? "Here's what you told us when you ordered. Next: connect your Facebook Page and Instagram, then add your brand and products."
              : "Tell us about your business. Next: connect your Facebook Page and Instagram, then add your brand and products."}
          </p>
        </div>
        <WelcomeForm initial={prefill ? { name: prefill.name, category: prefill.category, languages: prefill.languages } : null} />
      </Card>
    </Centered>
  );
}
