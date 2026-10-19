import { Badge, Button, Card } from "@retexia/ui";
import { Share2 } from "lucide-react";
import Link from "next/link";
import { accountsOf, listPostBusinesses } from "./data";

/** Customer page: their Retexia Post business(es), connected accounts, and "Add Facebook & Instagram". */
export async function PostCustomerCard({ userId, canConnect, hasPost }: { userId: string; canConnect: boolean; hasPost: boolean }) {
  const { rows, error } = await listPostBusinesses(userId);
  if (!rows.length && !hasPost && !error) return null;
  const accounts = await accountsOf(rows.map((b) => b.id));
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="type-h2 text-ink">Retexia Post</h2>
      {error ? <p className="type-body text-danger">Can&apos;t read the Post database: {error}</p> : null}
      {rows.length ? (
        <ul className="flex flex-col gap-3">
          {rows.map((b) => {
            const mine = accounts.filter((a) => a.business_id === b.id);
            return (
              <li key={b.id} className="flex flex-col gap-3 rounded-md border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/products/post/businesses/${b.id}`} className="type-label text-ink underline-offset-4 hover:underline">
                    {b.name}
                  </Link>
                  <Badge tone={b.onboarding_done ? "success" : "neutral"}>{b.onboarding_done ? "Set up" : "Setting up"}</Badge>
                </div>
                {mine.length ? (
                  <ul className="flex flex-col gap-1.5">
                    {mine.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-2 type-small text-ink">
                        {a.platform === "facebook" ? "Facebook Page" : "Instagram"} · {a.display_name ?? a.external_id}
                        <Badge tone={a.status === "connected" ? (a.enabled ? "success" : "neutral") : "danger"}>
                          {a.status === "connected" ? (a.enabled ? "Connected" : "Off") : a.status.replace(/_/g, " ")}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="type-small text-ink-muted">No Facebook or Instagram connected yet.</p>
                )}
                {canConnect ? (
                  <Button href={`/products/post/businesses/${b.id}/connect?from=customer`} size="sm" variant="secondary" className="self-start" icon={<Share2 aria-hidden size={14} strokeWidth={1.5} />}>
                    {mine.length ? "Add or reconnect Facebook & Instagram" : "Add Facebook & Instagram"}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="type-body text-ink-muted">No Post business yet: the customer creates it the first time they open post.retexia.com. Then you can connect their Facebook & Instagram here.</p>
      )}
    </Card>
  );
}
