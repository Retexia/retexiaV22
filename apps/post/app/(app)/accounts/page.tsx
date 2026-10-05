import { createServerClient } from "@retexia/supabase/server";
import { Alert, Badge, Button, Card, EmptyState, formatDate } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import { Share2 } from "lucide-react";
import { AccountToggle } from "@/components/account-toggle";
import { PLAN_LIMITS } from "@/lib/plans";
import { requireBusinessPage } from "@/lib/session";
import { withinDays } from "@/lib/time";

export const metadata = { title: "Facebook and Instagram" };

export default async function AccountsPage() {
  const { business, customer, db } = await requireBusinessPage("/accounts");
  const [{ data: accounts }, main] = await Promise.all([
    db.from("social_accounts").select("*").eq("business_id", business.id).order("platform"),
    (await createServerClient()).from("site_settings").select("whatsapp_number").eq("id", 1).maybeSingle(),
  ]);
  const wa = main.data?.whatsapp_number?.replace(/[^\d]/g, "");
  const waHref = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Hi, please connect my Facebook and Instagram to Retexia Post (${customer.order.ref}).`)}` : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Facebook and Instagram" description="Where your posts go. Turn an account off to stop posting there without disconnecting it." />
      <Alert tone="info" title="Connecting accounts">
        Our team connects your Facebook Page and Instagram Business account with you during setup (Instagram must be a Business account linked to your Page). Your plan allows {PLAN_LIMITS[business.plan].accounts} accounts.
        {waHref ? (
          <span className="mt-2 block">
            <Button href={waHref} size="sm" variant="secondary" target="_blank">
              Message us to connect or reconnect
            </Button>
          </span>
        ) : null}
      </Alert>
      {(accounts ?? []).length ? (
        <Card padded={false}>
          <ul className="divide-y divide-line">
            {(accounts ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- Meta avatar URL */}
                {a.avatar_url ? <img src={a.avatar_url} alt="" className="size-10 rounded-full" /> : <span className="flex size-10 items-center justify-center rounded-full bg-surface-sunk"><Share2 aria-hidden size={18} strokeWidth={1.5} /></span>}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="type-label text-ink">{a.display_name ?? a.external_id}</span>
                    <Badge tone="neutral">{a.platform === "facebook" ? "Facebook Page" : `Instagram${a.ig_account_type ? ` ${a.ig_account_type}` : ""}`}</Badge>
                    {a.status === "connected" ? <Badge tone="success">Connected</Badge> : a.status === "reconnect_needed" ? <Badge tone="danger">Reconnect needed</Badge> : <Badge tone="neutral">Disconnected</Badge>}
                  </span>
                  <span className="type-small text-ink-muted">
                    {a.platform === "instagram" && a.ig_account_type === "creator" ? "Creator account: posts and Reels only (stories need a Business account). " : ""}
                    {a.token_expires_at ? (withinDays(a.token_expires_at, 7) ? `Access expires ${formatDate(a.token_expires_at)}: reconnect soon. ` : `Access valid until ${formatDate(a.token_expires_at)}.`) : ""}
                  </span>
                </div>
                <AccountToggle id={a.id} enabled={a.enabled} disabled={a.status !== "connected"} />
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState title="No accounts connected yet" icon={<Share2 aria-hidden size={24} strokeWidth={1.5} />}>
          Posts are prepared and kept as drafts until an account is connected.
        </EmptyState>
      )}
    </div>
  );
}
