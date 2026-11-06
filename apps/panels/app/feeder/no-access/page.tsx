import { createServerClient } from "@retexia/supabase/server";
import { Button, Card } from "@retexia/ui";
import { Centered } from "@/components/centered";
import { webUrl } from "@/lib/env";
import { feederSlug } from "@/lib/feeder/access";

export const metadata = { title: "Retexia Feeder" };

/** No Feeder package open: a free trial that has ended (pay to continue), or none at all. */
export default async function FeederNoAccess() {
  const supabase = await createServerClient();
  const { data: product } = await supabase.from("products").select("id").eq("slug", feederSlug()).maybeSingle();
  const { data: ended } = product
    ? await supabase
        .from("orders")
        .select("ref")
        .eq("product_id", product.id)
        .or(`status.eq.trial_ended,and(status.eq.trial,trial_ends_at.lte.${new Date().toISOString()})`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  if (ended?.ref) {
    return (
      <Centered product="feeder">
        <Card className="flex flex-col items-center gap-4 text-center">
          <h1 className="type-h1 text-ink">Your free trial has ended</h1>
          <p className="type-body text-ink-muted">Thank you for trying Retexia Feeder. Pay from your Retexia account to keep using it; your products, form names and CRM links are kept.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button href={`${webUrl()}/account/products/${encodeURIComponent(ended.ref)}`}>Pay to continue</Button>
            <Button href={`${webUrl()}/contact`} variant="secondary">
              Talk to us
            </Button>
          </div>
        </Card>
      </Centered>
    );
  }

  return (
    <Centered product="feeder">
      <Card className="flex flex-col items-center gap-4 text-center">
        <h1 className="type-h1 text-ink">Feeder isn&apos;t active on this account</h1>
        <p className="type-body text-ink-muted">Sign in with the account you ordered a Feeder package with. If you already paid, we&apos;re confirming it and will message you when it&apos;s ready.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button href={`${webUrl()}/${feederSlug()}`}>See Retexia Feeder</Button>
          <Button href={`${webUrl()}/account/products`} variant="secondary">
            My products
          </Button>
        </div>
      </Card>
    </Centered>
  );
}
