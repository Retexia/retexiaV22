import { Button, Card } from "@retexia/ui";
import { Centered } from "@/components/centered";
import { webUrl } from "@/lib/env";
import { getCustomer } from "@/lib/session";

export const metadata = { title: "Retexia Post" };

export default async function NoAccessPage() {
  const customer = await getCustomer();
  return (
    <Centered>
      <Card className="flex flex-col items-center gap-4 text-center">
        <h1 className="type-h1 text-ink">Retexia Post isn&apos;t active yet</h1>
        <p className="type-body text-ink-muted">
          {customer
            ? "Your account doesn't have a Retexia Post subscription that is set up. If you already paid, we are still setting it up; we'll message you when it's ready."
            : "Sign in with your Retexia account to open Retexia Post."}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button href={`${webUrl()}/post`}>See Retexia Post</Button>
          <Button href={`${webUrl()}/account/products`} variant="secondary">
            My products
          </Button>
        </div>
      </Card>
    </Centered>
  );
}
