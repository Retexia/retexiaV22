"use client";

import { Alert, Badge, Button, Card, Field, Input, Select, Switch } from "@retexia/ui";
import { CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { checkAccount, saveAccount } from "@/app/feeder/(app)/autopublish/actions";
import type { AccountRow } from "@/lib/feeder/autopublish/types";
import { CONN_STATE, timeAgo } from "./labels";

type Props = {
  account: AccountRow | null;
  metaBusinessId: string | null;
  tiktokBusinessCenterId: string | null;
  ready: boolean;
};

const TIMEZONES = ["Asia/Colombo", "Asia/Kolkata", "Asia/Dubai", "Asia/Qatar", "Asia/Riyadh", "Indian/Maldives", "Europe/London", "Australia/Sydney", "America/New_York", "UTC"];

function Steps({ children }: { children: ReactNode }) {
  return <ol className="flex list-decimal flex-col gap-1.5 pl-5 type-small text-ink-muted marker:text-ink-muted">{children}</ol>;
}

function Found({ info, platform }: { info: Record<string, unknown>; platform: "meta" | "tiktok" }) {
  const problems = (info.problems as string[] | undefined) ?? [];
  const forms = (info.forms as { name: string }[] | undefined) ?? [];
  if (!info.checked_at) return null;
  const facts =
    platform === "meta"
      ? [
          info.account_name && `Ad account: ${info.account_name}`,
          info.business_name && `Business: ${info.business_name}`,
          info.page_name && `Page: ${info.page_name}`,
          info.instagram_name && `Instagram: @${info.instagram_name}`,
          info.currency && `Currency: ${info.currency}`,
          info.page_name && info.forms && `${forms.length} Instant Form${forms.length === 1 ? "" : "s"} on the Page`,
        ]
      : [
          info.name && `Advertiser: ${info.name}`,
          info.currency && `Currency: ${info.currency}`,
          info.name && info.identities && `${((info.identities as unknown[]) ?? []).length} TikTok account(s)`,
          info.name && info.forms && `${forms.length} Instant Form${forms.length === 1 ? "" : "s"}`,
        ];
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-sunk p-3">
      <p className="type-small text-ink-muted">Checked {timeAgo(String(info.checked_at))}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 type-small text-ink empty:hidden">
        {facts.filter(Boolean).map((f) => (
          <li key={String(f)} className="flex items-center gap-1.5">
            <CheckCircle2 aria-hidden size={14} strokeWidth={1.75} className="text-success" />
            {String(f)}
          </li>
        ))}
      </ul>
      {problems.length ? (
        <ul className="flex flex-col gap-1">
          {problems.map((p) => (
            <li key={p} className="flex items-start gap-1.5 type-small text-danger">
              <CircleAlert aria-hidden size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" />
              {p}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Autopublish → Accounts: the customer's Meta ad account / Page / Instagram /
 * Pixel and TikTok advertiser (shared with Retexia as a partner), the spend
 * limit, approvals and WhatsApp numbers. New or changed IDs wait for Retexia.
 */
export function AccountsForm({ account: a, metaBusinessId, tiktokBusinessCenterId, ready }: Props) {
  const router = useRouter();
  const [v, setV] = useState({
    meta_ad_account_id: a?.meta_ad_account_id ?? "",
    meta_page_id: a?.meta_page_id ?? "",
    meta_instagram_id: a?.meta_instagram_id ?? "",
    meta_pixel_id: a?.meta_pixel_id ?? "",
    meta_whatsapp: a?.meta_whatsapp ?? "",
    tiktok_advertiser_id: a?.tiktok_advertiser_id ?? "",
    tiktok_identity: a?.tiktok_identity_id ? `${a.tiktok_identity_type}:${a.tiktok_identity_id}` : "",
    currency: a?.currency ?? "LKR",
    timezone: a?.timezone ?? "Asia/Colombo",
    max_daily_spend: a?.max_daily_spend != null ? String(a.max_daily_spend) : "",
    privacy_policy_url: a?.privacy_policy_url ?? "",
    approval_required: a?.approval_required ?? false,
    approver_whatsapp: (a?.approver_whatsapp ?? []).join(", "),
    notify_whatsapp: (a?.notify_whatsapp ?? []).join(", "),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const identities = a?.tiktok_info?.identities ?? [];

  async function save() {
    setBusy("save");
    setErrors({});
    const list = (s: string) => s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
    const r = await saveAccount({
      ...v,
      max_daily_spend: v.max_daily_spend.trim() ? Number(v.max_daily_spend.replace(/,/g, "")) : null,
      approver_whatsapp: list(v.approver_whatsapp),
      notify_whatsapp: list(v.notify_whatsapp),
    });
    setBusy(null);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      return toast.error(r.message);
    }
    toast.success(r.message ?? "Saved");
    router.refresh();
  }

  async function check(platform: "meta" | "tiktok") {
    setBusy(platform);
    const r = await checkAccount({ platform });
    setBusy(null);
    if (!r.ok) return toast.error(r.message);
    (r.data?.ok ? toast.success : toast.warning)(r.message ?? "Checked");
    router.refresh();
  }

  const status = (s: string | undefined) => {
    const c = CONN_STATE[s ?? "none"] ?? CONN_STATE.none!;
    return <Badge tone={c.tone}>{c.label}</Badge>;
  };

  return (
    <div className="flex flex-col gap-6">
      {!ready ? (
        <Alert tone="info" title="Autopublish is being switched on">
          You can fill this in now. Checking accounts and launching start as soon as Retexia finishes the setup.
        </Alert>
      ) : null}

      <Card className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="type-h2 text-ink">Facebook &amp; Instagram (Meta)</h2>
            <p className="type-small text-ink-muted">Your ads run on your own ad account and Page; Retexia only creates and watches them.</p>
          </div>
          {status(a?.meta_status)}
        </div>
        <Steps>
          <li>
            Open <span className="text-ink">business.facebook.com → Settings → Accounts → Ad accounts</span>, pick your ad account → <span className="text-ink">Assign partner</span> → enter Retexia&apos;s Business ID{" "}
            <span className="type-code text-ink">{metaBusinessId ?? "(ask the Retexia team)"}</span> → give <span className="text-ink">Manage campaigns</span>.
          </li>
          <li>
            Do the same for your <span className="text-ink">Page</span> (with &quot;Create ads&quot; and &quot;Leads&quot;), your Instagram account and your Pixel if you use one.
          </li>
          <li>Enter the IDs below and press Save. Retexia confirms the access, usually within a day.</li>
        </Steps>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ad account ID" hint="Ads Manager → the number after act=" error={errors.meta_ad_account_id} required>
            <Input inputMode="numeric" value={v.meta_ad_account_id} onChange={set("meta_ad_account_id")} placeholder="e.g. 1234567890123456" />
          </Field>
          <Field label="Facebook Page ID" hint="Page → About → Page transparency → Page ID" error={errors.meta_page_id} required>
            <Input inputMode="numeric" value={v.meta_page_id} onChange={set("meta_page_id")} />
          </Field>
          <Field label="Instagram account ID" hint="Business settings → Instagram accounts" error={errors.meta_instagram_id}>
            <Input inputMode="numeric" value={v.meta_instagram_id} onChange={set("meta_instagram_id")} />
          </Field>
          <Field label="Pixel ID" hint="Only for website sales" error={errors.meta_pixel_id}>
            <Input inputMode="numeric" value={v.meta_pixel_id} onChange={set("meta_pixel_id")} />
          </Field>
          <Field label="WhatsApp number linked to the Page" hint="Only for message ads on WhatsApp" error={errors.meta_whatsapp}>
            <Input inputMode="tel" value={v.meta_whatsapp} onChange={set("meta_whatsapp")} placeholder="94771234567" />
          </Field>
          <Field
            label="Privacy policy link"
            hint="Meta asks for one on every lead form. Retexia makes the form named after your product when it isn't on your Page yet."
            error={errors.privacy_policy_url}
          >
            <Input type="url" value={v.privacy_policy_url} onChange={set("privacy_policy_url")} placeholder="https://…" />
          </Field>
        </div>
        {a?.meta_info?.checked_at ? <Found info={a.meta_info as Record<string, unknown>} platform="meta" /> : null}
        {a?.meta_status === "requested" ? <p className="type-small text-ink-muted">Retexia is confirming access to this account. Launching opens as soon as it&apos;s connected.</p> : null}
        {a?.meta_ad_account_id ? (
          <div>
            <Button variant="secondary" size="sm" onClick={() => check("meta")} loading={busy === "meta"} disabled={!ready || Boolean(busy)}>
              <RefreshCw aria-hidden size={14} strokeWidth={1.75} /> Check again
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="type-h2 text-ink">TikTok</h2>
            <p className="type-small text-ink-muted">Video ads only. Leads (Instant Form) and website visits.</p>
          </div>
          {status(a?.tiktok_status)}
        </div>
        <Steps>
          <li>
            In <span className="text-ink">TikTok Business Center → Assets → Advertiser accounts</span>, share your advertiser account with Retexia&apos;s Business Center ID{" "}
            <span className="type-code text-ink">{tiktokBusinessCenterId ?? "(ask the Retexia team)"}</span> as a partner (operator access).
          </li>
          <li>Enter the advertiser ID and press Save; after Retexia confirms, pick the TikTok account your ads show as.</li>
        </Steps>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Advertiser ID" hint="TikTok Ads Manager → top right, under your account name" error={errors.tiktok_advertiser_id}>
            <Input inputMode="numeric" value={v.tiktok_advertiser_id} onChange={set("tiktok_advertiser_id")} />
          </Field>
          <Field label="Ads show as" hint={identities.length ? "Your TikTok account (identity) on the ads" : "Appears after the first check"} error={errors.tiktok_identity}>
            <Select
              value={v.tiktok_identity}
              onChange={set("tiktok_identity")}
              disabled={!identities.length}
              placeholder="Choose the TikTok account"
              options={identities.map((i) => ({ value: `${i.type}:${i.id}`, label: `${i.name} (${i.type === "TT_USER" ? "TikTok account" : i.type === "CUSTOMIZED_USER" ? "custom identity" : i.type})` }))}
            />
          </Field>
        </div>
        {a?.tiktok_info?.checked_at ? <Found info={a.tiktok_info as Record<string, unknown>} platform="tiktok" /> : null}
        {a?.tiktok_advertiser_id ? (
          <div>
            <Button variant="secondary" size="sm" onClick={() => check("tiktok")} loading={busy === "tiktok"} disabled={!ready || Boolean(busy)}>
              <RefreshCw aria-hidden size={14} strokeWidth={1.75} /> Check again
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-5">
        <h2 className="type-h2 text-ink">Safety and messages</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Daily spend limit (${v.currency})`} hint="Autopublish never switches on more than this a day, Meta and TikTok together. Empty = no limit." error={errors.max_daily_spend}>
            <Input inputMode="decimal" value={v.max_daily_spend} onChange={set("max_daily_spend")} placeholder="e.g. 10000" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency" hint="From your ad account" error={errors.currency} required>
              <Input value={v.currency} maxLength={3} onChange={set("currency")} />
            </Field>
            <Field label="Time zone" error={errors.timezone} required>
              <Select value={v.timezone} onChange={set("timezone")} options={[...new Set([v.timezone, ...TIMEZONES])].map((t) => ({ value: t, label: t }))} />
            </Field>
          </div>
        </div>
        <Switch
          checked={v.approval_required}
          onCheckedChange={(c) => setV((x) => ({ ...x, approval_required: c }))}
          label="Ask for approval before ads go out"
          description="Every launch waits until someone presses Approve on its page (templates can change this). Approvers get a WhatsApp with the link."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Approvers' WhatsApp numbers" hint="Up to 5, separated by commas" error={errors.approver_whatsapp}>
            <Input value={v.approver_whatsapp} onChange={set("approver_whatsapp")} placeholder="94771234567" />
          </Field>
          <Field label="Send updates to (WhatsApp)" hint="Live, not approved, needs attention. Up to 5." error={errors.notify_whatsapp}>
            <Input value={v.notify_whatsapp} onChange={set("notify_whatsapp")} placeholder="94771234567" />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} loading={busy === "save"} disabled={Boolean(busy)}>
          Save
        </Button>
      </div>
    </div>
  );
}
