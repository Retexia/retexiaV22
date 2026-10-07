import { Button, Card } from "@retexia/ui";
import { redirect } from "next/navigation";
import { Centered } from "@/components/centered";
import { webUrl } from "@/lib/env";
import { lingoCustomer } from "@/lib/lingo/session";

export const metadata = { title: "Setting up" };

export default async function LingoSettingUp() {
  const customer = await lingoCustomer();
  if (!customer?.order) redirect("/no-access");
  return (
    <Centered product="lingo">
      <Card className="flex flex-col items-center gap-4 text-center">
        <h1 className="type-h1 text-ink">Your Lingo panel is almost ready</h1>
        <p className="type-body text-ink-muted">We&apos;re connecting your WhatsApp bot to this panel ({customer.order.ref}). We&apos;ll message you as soon as it&apos;s done, usually the same day.</p>
        <Button href={`${webUrl()}/account/products/${encodeURIComponent(customer.order.ref)}`} variant="secondary">
          See my order
        </Button>
      </Card>
    </Centered>
  );
}
