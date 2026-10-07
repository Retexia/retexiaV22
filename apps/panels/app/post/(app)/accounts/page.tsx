import { createServerClient } from "@retexia/supabase/server";
import { Alert, Badge, Button, Card, EmptyState, formatDate } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import { Share2 } from "lucide-react";
import { FacebookIcon } from "@/components/post/brand-icons";
import { AccountToggle } from "@/components/post/account-toggle";
import { DisconnectAccount } from "@/components/post/disconnect-account";
import { MetaPicker } from "@/components/post/meta-picker";
import { metaConfig } from "@/lib/post/meta";
import { pageOption, pendingConnection } from "@/lib/post/meta-connect";
import { PLAN_LIMITS } from "@/lib/post/plans";
import { requireBusinessPage } from "@/lib/post/session";
import { withinDays } from "@/lib/time";

export const metadata = { title: "Facebook and Instagram" };

const MESSAGES: Record<string, { tone: "warning" | "danger" | "info"; text: string }> = {
  cancelled: { tone: "info", text: "Facebook connection cancelled. Nothing was changed." },
  expired: { tone: "warning", text: "That connection link expired. Press Continue with Facebook again." },
  error: { tone: "danger", text: "Facebook didn't complete the connection." },
  unavailable: { tone: "warning", text: "Connecting with Facebook isn't switched on yet. Message us and we connect your accounts for you." },
};

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ connect?: string; meta?: string; reason?: string }> }) {
  const [{ business, customer, db }, sp] = await Promise.all([requireBusinessPage("/accounts"), searchParams]);
  const [{ data: accounts }, main, pending] = await Promise.all([
    db.from("social_accounts").select("*").eq("business_id", business.id).order("platform"),
    (await createServerClient()).from("site_settings").select("whatsapp_number").eq("id", 1).maybeSingle(),
    sp.connect && /^[0-9a-f-]{36}$/.test(sp.connect) ? pendingConnection(db, business.id, sp.connect) : Promise.resolve(null),
  ]);
  const limit = PLAN_LIMITS[business.plan].accounts;
  const connected = (accounts ?? []).filter((a) => a.status === "connected").length;
  const canConnect = Boolean(metaConfig());
  const wa = main.data?.whatsapp_number?.replace(/[^\d]/g, "");
  const waHref = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Hi, please help me connect Facebook and Instagram to Retexia Post (${customer.order.ref}).`)}` : null;
  const msg = sp.meta ? MESSAGES[sp.meta] : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Facebook and Instagram"
        description="Where your posts go. Turn an account off to stop posting there without disconnecting it."
        actions={
          canConnect ? (
            <Button href="/connect/meta" icon={<FacebookIcon />}>
              {connected ? "Add or reconnect accounts" : "Continue with Facebook"}
            </Button>
          ) : null
        }
      />
      {msg ? (
        <Alert tone={msg.tone}>
          {msg.text}
          {sp.reason ? ` (${sp.reason.slice(0, 120)})` : ""}
        </Alert>
      ) : null}
      {sp.connect && !pending ? <Alert tone="warning">That connection expired. Press Continue with Facebook again.</Alert> : null}
      {pending ? (
        pending.error ? (
          <Alert tone="danger">Facebook: {pending.error}</Alert>
        ) : (
          <MetaPicker connectId={pending.conn.id} pages={pending.pages.map(pageOption)} limit={limit} used={connected} />
        )
      ) : null}

      <Alert tone="info" title="Before you connect">
        You need a Facebook Page you manage. For Instagram, switch it to a <strong>Business</strong> account and link it to that Page (Instagram → Settings → Account type and tools). Your plan allows {limit} accounts.
        {waHref ? (
          <span className="mt-2 block">
            <Button href={waHref} size="sm" variant="secondary" target="_blank">
              Need help? Message us
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
                    {a.status === "reconnect_needed" ? "Facebook stopped Retexia's access. Press “Add or reconnect accounts” and pick this account again. " : ""}
                    {a.platform === "instagram" && a.ig_account_type === "creator" ? "Creator account: posts only (stories need a Business account). " : ""}
                    {a.token_expires_at ? (withinDays(a.token_expires_at, 7) ? `Access expires ${formatDate(a.token_expires_at)}: reconnect soon. ` : `Access valid until ${formatDate(a.token_expires_at)}.`) : ""}
                    {a.status === "connected" && !a.token_secret_id ? "Connected by hand: reconnect with Facebook so Post can publish here. " : ""}
                  </span>
                </div>
                <AccountToggle id={a.id} enabled={a.enabled} disabled={a.status !== "connected"} />
                {a.status !== "disconnected" ? <DisconnectAccount id={a.id} name={a.display_name ?? a.platform} /> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : !pending ? (
        <EmptyState
          title="No accounts connected yet"
          icon={<Share2 aria-hidden size={24} strokeWidth={1.5} />}
          actions={
            canConnect ? (
              <Button href="/connect/meta" icon={<FacebookIcon />}>
                Continue with Facebook
              </Button>
            ) : null
          }
        >
          Posts are prepared, but nothing is published until you connect a Facebook Page or Instagram account.
        </EmptyState>
      ) : null}
    </div>
  );
}
