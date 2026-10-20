import { Button, Card } from "@retexia/ui";
import { Centered } from "@/components/centered";
import { webUrl } from "@/lib/env";
import { feederSlug } from "@/lib/feeder/access";

export const metadata = { title: "Retexia Feeder" };

export default function FeederNoAccess() {
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
