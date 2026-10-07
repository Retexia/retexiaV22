import { Badge, Card } from "@retexia/ui";
import Link from "next/link";
import type { RequestPanelContext } from "../registry";
import { listPostBusinesses } from "./data";

/** Setup tab card on a Post request: the customer's businesses in Retexia Post. */
export async function PostRequestPanel({ staff, orderId }: RequestPanelContext) {
  const { data: order } = await staff.supabase.from("staff_orders").select("user_id").eq("id", orderId).maybeSingle();
  const { rows, error } = order?.user_id ? await listPostBusinesses(order.user_id) : { rows: [], error: null };
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="type-h2 text-ink">Retexia Post business</h2>
      {error ? (
        <p className="type-body text-danger">Can&apos;t read the Post database: {error}</p>
      ) : rows.length ? (
        <ul className="flex flex-col gap-2">
          {rows.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3">
              <Link href={`/products/post/businesses/${b.id}`} className="type-body text-ink underline-offset-4 hover:underline">
                {b.name}
              </Link>
              <span className="flex gap-2">
                <Badge tone={b.onboarding_done ? "success" : "neutral"}>{b.onboarding_done ? "Set up" : "Setting up"}</Badge>
                <Badge tone="neutral">{b.stats.accounts_connected} accounts</Badge>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-body text-ink-muted">
          No business yet. Once the request is active, the customer opens post.retexia.com and sets it up there (about 10 minutes).
        </p>
      )}
    </Card>
  );
}
