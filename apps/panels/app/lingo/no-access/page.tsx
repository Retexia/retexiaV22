import { Button, Card } from "@retexia/ui";
import { Centered } from "@/components/centered";
import { webUrl } from "@/lib/env";

export const metadata = { title: "Retexia Lingo" };

export default function LingoNoAccess() {
  return (
    <Centered product="lingo">
      <Card className="flex flex-col items-center gap-4 text-center">
        <h1 className="type-h1 text-ink">Lingo isn&apos;t active on this account</h1>
        <p className="type-body text-ink-muted">Sign in with the account you ordered Lingo with. If you already paid, we&apos;re still setting it up and will message you when it&apos;s ready.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button href={`${webUrl()}/lingo`}>See Retexia Lingo</Button>
          <Button href={`${webUrl()}/account/products`} variant="secondary">
            My products
          </Button>
        </div>
      </Card>
    </Centered>
  );
}
