import { Badge, Button, Card } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import { Lock } from "lucide-react";
import { redirect } from "next/navigation";
import { requireFeederPage } from "@/lib/feeder/access";
import { isSetUp } from "@/lib/feeder/data";

export const metadata = { title: "Feeder" };

export default async function FeederHome() {
  const { productName, packages, buyUrl, user } = await requireFeederPage("/");
  if (!(await isSetUp(user.id))) redirect("/setup");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={productName} description="Your packages are open. The others are locked until you add them to your account." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((p) => (
          <Card key={p.id} className={`flex flex-col gap-3 ${p.owned ? "" : "opacity-60 grayscale"}`}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="type-h3 text-ink">{p.name}</h2>
              {p.owned ? (
                <Badge tone={p.orderStatus === "active" ? "success" : "neutral"}>{p.orderStatus === "active" ? "Active" : p.orderStatus === "paused" ? "Paused" : "Setting up"}</Badge>
              ) : (
                <Badge tone="neutral">
                  <Lock aria-hidden size={12} strokeWidth={1.5} className="mr-1 inline" />
                  Locked
                </Badge>
              )}
            </div>
            {p.tagline ? <p className="type-body text-ink-muted">{p.tagline}</p> : null}
            <div className="mt-auto pt-2">
              {p.owned ? (
                <Button href={`/${p.slug}`} size="sm">
                  Open
                </Button>
              ) : (
                <Button href={buyUrl(p.slug)} size="sm" variant="secondary" target="_self">
                  Get this package
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
