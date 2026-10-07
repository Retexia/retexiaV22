import { Button, Card } from "@retexia/ui";
import { redirect } from "next/navigation";
import { Centered } from "@/components/centered";
import { LingoSetupForm } from "@/components/lingo/setup-form";
import { webUrl } from "@/lib/env";
import { evolutionConfig } from "@/lib/lingo/evolution";
import { lingoCustomer, tenantFor } from "@/lib/lingo/session";

export const metadata = { title: "Set up Lingo" };

/** A paying customer without a bot yet: set it up here, or (no self-setup) wait for the team. */
export default async function LingoSettingUp() {
  const customer = await lingoCustomer();
  if (!customer?.order) redirect("/no-access");
  if (await tenantFor(customer.id, customer.order.id)) redirect("/");
  const selfSetup = Boolean(evolutionConfig()?.webhook);
  return (
    <Centered product="lingo">
      {selfSetup ? (
        <LingoSetupForm initial={{ business_name: "", owner_phone: (customer.phone ?? "").replace(/\D/g, "") }} />
      ) : (
        <Card className="flex flex-col items-center gap-4 text-center">
          <h1 className="type-h1 text-ink">Your Lingo panel is almost ready</h1>
          <p className="type-body text-ink-muted">
            We&apos;re connecting your WhatsApp bot to this panel ({customer.order.ref}). We&apos;ll message you as soon as it&apos;s done, usually the same day.
          </p>
          <Button href={`${webUrl()}/account/products/${encodeURIComponent(customer.order.ref)}`} variant="secondary">
            See my order
          </Button>
        </Card>
      )}
    </Centered>
  );
}
