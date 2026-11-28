"use client";

import { Alert, Badge, Button, Card, Field, Input } from "@retexia/ui";
import { CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { checkMeta, connectMeta, disconnectMeta, saveMetaChoices } from "@/app/feeder/(app)/connections/actions";

export type MetaConn = {
  business_id: string;
  business_name: string | null;
  token_last4: string | null;
  token_user: string | null;
  status: "pending" | "connected" | "problem";
  problem: string | null;
  checked_at: string | null;
};
export type MetaAsset = {
  kind: "ad_account" | "page";
  asset_id: string;
  name: string | null;
  info: { currency?: string | null; timezone?: string | null; instagram?: { id: string; username: string | null } | null };
  for_autopublish: boolean;
  for_comments: boolean;
  is_default: boolean;
  status: "ok" | "problem" | "gone";
  problem: string | null;
};
type Props = {
  conn: MetaConn | null;
  assets: MetaAsset[];
  owns: { autopublish: boolean; comments: boolean };
  /** Permissions the token lacks per tool ([] = ready or unknown). */
  lacks: { autopublish: string[]; comments: string[]; messages: string[] };
};

const PERMS_AUTOPUBLISH = "ads_management, ads_read, business_management, pages_show_list, pages_manage_ads, pages_read_engagement, leads_retrieval";
const PERMS_COMMENTS = "pages_show_list, pages_read_engagement, pages_read_user_content, pages_manage_engagement, pages_messaging";

function Ready({ label, lacks, extra }: { label: string; lacks: string[]; extra?: ReactNode }) {
  return (
    <li className="flex items-start gap-1.5 type-small">
      {lacks.length ? <CircleAlert aria-hidden size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warning" /> : <CheckCircle2 aria-hidden size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-success" />}
      <span className="text-ink">
        {label}: {lacks.length ? <span className="text-warning">the token is missing {lacks.join(", ")}</span> : "ready"}
        {extra}
      </span>
    </li>
  );
}

/** Connections → Facebook: the seller's own Business portfolio, its ad accounts (Autopublish) and Pages (Autopublish, Auto comment). */
export function MetaConnection({ conn, assets, owns, lacks }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ business_id: conn?.business_id ?? "", token: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [replacing, setReplacing] = useState(!conn);
  const ads = assets.filter((a) => a.kind === "ad_account" && a.status !== "gone");
  const pages = assets.filter((a) => a.kind === "page" && a.status !== "gone");
  const [use, setUse] = useState(() => new Set(ads.filter((a) => a.for_autopublish).map((a) => a.asset_id)));
  const [def, setDef] = useState(ads.find((a) => a.is_default)?.asset_id ?? null);
  const [adsPage, setAdsPage] = useState(pages.find((p) => p.is_default)?.asset_id ?? null);
  const [comments, setComments] = useState(() => new Set(pages.filter((p) => p.for_comments).map((p) => p.asset_id)));

  const act = (fn: () => Promise<{ ok: boolean; message?: string; fieldErrors?: Record<string, string> }>, after?: () => void) =>
    start(async () => {
      let r: { ok: boolean; message?: string; fieldErrors?: Record<string, string> };
      try {
        r = await fn();
      } catch {
        // The request itself failed (a new version was deployed, the network, a timeout): say so, don't crash the page.
        r = { ok: false, message: "Retexia couldn't finish that. Reload the page (a new version may be out) and try again." };
      }
      if (r.ok) {
        setErrors({});
        if (r.message) toast.success(r.message);
        after?.();
        router.refresh();
      } else {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.message ?? "That didn't work.");
      }
    });

  const toggle = (set: Set<string>, id: string, max?: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else if (!max || next.size < max) next.add(id);
    else toast.error(`At most ${max}.`);
    return next;
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="type-h3 text-ink">Your Meta Business portfolio</h3>
            <p className="type-small text-ink-muted">
              {conn
                ? `${conn.business_name ?? "Business portfolio"} · ID ${conn.business_id} · token ••••${conn.token_last4 ?? ""}${conn.token_user ? ` (${conn.token_user})` : ""}`
                : "Connect it once. Retexia only uses the ad accounts and Pages that this portfolio owns."}
            </p>
          </div>
          {conn ? (
            <Badge tone={conn.status === "connected" ? "success" : conn.status === "problem" ? "danger" : "neutral"}>
              {conn.status === "connected" ? "Connected" : conn.status === "problem" ? "Needs attention" : "Checking"}
            </Badge>
          ) : null}
        </div>

        {conn?.problem ? <Alert tone="warning" title="Facebook needs attention">{conn.problem}</Alert> : null}

        {conn ? (
          <ul className="flex flex-col gap-1">
            {owns.autopublish ? <Ready label="Autopublish" lacks={lacks.autopublish} /> : null}
            {owns.comments ? (
              <Ready
                label="Auto comment"
                lacks={lacks.comments}
                extra={!lacks.comments.length && lacks.messages.length ? <span className="text-ink-muted"> (private messages need pages_messaging)</span> : null}
              />
            ) : null}
          </ul>
        ) : null}

        {replacing ? (
          <div className="flex flex-col gap-4 rounded-md border border-line bg-surface-sunk p-4">
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 type-small text-ink-muted">
              <li>
                <span className="text-ink">business.facebook.com → Settings → Business info</span>: copy the <span className="text-ink">Business portfolio ID</span>.
              </li>
              <li>
                <span className="text-ink">Users → System users → Add</span> (Admin). Then <span className="text-ink">Assign assets</span>:
                {owns.autopublish ? " your ad accounts (Manage campaigns) and" : ""} your Pages ({owns.autopublish ? "Create ads, Leads, " : ""}Moderate{owns.comments ? ", Messages" : ""}).
              </li>
              <li>
                <span className="text-ink">Generate new token</span> (your Meta app, expiry: Never) with these permissions:
                {owns.autopublish ? <span className="block type-code text-ink">Autopublish: {PERMS_AUTOPUBLISH}</span> : null}
                {owns.comments ? <span className="block type-code text-ink">Auto comment (Pages only is enough): {PERMS_COMMENTS}</span> : null}
              </li>
              <li>Paste both below. The token is kept encrypted and is never shown again.</li>
            </ol>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business portfolio ID" required error={errors.business_id}>
                <Input inputMode="numeric" value={form.business_id} onChange={(e) => setForm({ ...form, business_id: e.target.value })} placeholder="e.g. 1234567890123456" />
              </Field>
              <Field label="System User token" required error={errors.token}>
                <Input type="password" autoComplete="off" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder="EAA…" />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={pending || !form.business_id || !form.token} onClick={() => act(() => connectMeta(form), () => { setForm({ ...form, token: "" }); setReplacing(false); })}>
                {pending ? "Checking with Facebook…" : conn ? "Save the new token" : "Connect"}
              </Button>
              {conn ? <Button size="sm" variant="ghost" onClick={() => setReplacing(false)}>Cancel</Button> : null}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(() => checkMeta())}>
              <RefreshCw aria-hidden size={14} strokeWidth={1.75} /> Check again
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReplacing(true)}>Replace token</Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (window.confirm("Disconnect your Business portfolio? The token is deleted, Autopublish stops launching and Auto comment switches off.")) act(() => disconnectMeta());
              }}
            >
              Disconnect
            </Button>
          </div>
        )}
      </Card>

      {conn && (ads.length || pages.length) ? (
        <Card className="flex flex-col gap-5">
          {owns.autopublish ? (
            <div className="flex flex-col gap-2">
              <h3 className="type-h3 text-ink">Ad accounts for Autopublish</h3>
              <p className="type-small text-ink-muted">Tick the ones Autopublish may use; you pick one on each launch. The default is picked first.</p>
              {ads.length ? (
                <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
                  {ads.map((a) => (
                    <li key={a.asset_id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                      <input type="checkbox" className="size-4 accent-[var(--rx-brand)]" checked={use.has(a.asset_id)} aria-label={`Use ${a.name}`} onChange={() => setUse(toggle(use, a.asset_id))} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="type-label text-ink">{a.name}</span>
                        <span className="type-small text-ink-muted">
                          act_{a.asset_id}{a.info.currency ? ` · ${a.info.currency}` : ""}{a.info.timezone ? ` · ${a.info.timezone}` : ""}
                        </span>
                        {a.problem ? <span className="type-small text-danger">{a.problem}</span> : null}
                      </div>
                      <label className="flex items-center gap-1.5 type-small text-ink-muted">
                        <input type="radio" name="default-ad" className="accent-[var(--rx-brand)]" checked={def === a.asset_id} disabled={!use.has(a.asset_id)} onChange={() => setDef(a.asset_id)} />
                        Default
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="type-small text-warning">No ad account of this portfolio reaches the token yet: assign them to the System User and generate the token again.</p>
              )}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <h3 className="type-h3 text-ink">Pages</h3>
            <p className="type-small text-ink-muted">
              {owns.autopublish ? "The Page your ads run from" : ""}
              {owns.autopublish && owns.comments ? ", and " : ""}
              {owns.comments ? "up to 2 Pages whose comments Auto comment answers" : ""}.
            </p>
            {pages.length ? (
              <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
                {pages.map((p) => (
                  <li key={p.asset_id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="type-label text-ink">{p.name}</span>
                      <span className="type-small text-ink-muted">
                        ID {p.asset_id}{p.info.instagram ? ` · Instagram @${p.info.instagram.username ?? p.info.instagram.id}` : ""}
                      </span>
                    </div>
                    {owns.autopublish ? (
                      <label className="flex items-center gap-1.5 type-small text-ink-muted">
                        <input type="radio" name="ads-page" className="accent-[var(--rx-brand)]" checked={adsPage === p.asset_id} onChange={() => setAdsPage(p.asset_id)} />
                        Ads Page
                      </label>
                    ) : null}
                    {owns.comments ? (
                      <label className="flex items-center gap-1.5 type-small text-ink-muted">
                        <input type="checkbox" className="size-4 accent-[var(--rx-brand)]" checked={comments.has(p.asset_id)} onChange={() => setComments(toggle(comments, p.asset_id, 2))} />
                        Auto comment
                      </label>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="type-small text-warning">No Page of this portfolio reaches the token yet: assign your Pages to the System User and generate the token again.</p>
            )}
          </div>

          <Button
            className="self-start"
            disabled={pending}
            onClick={() =>
              act(() =>
                saveMetaChoices({
                  ad_accounts: [...use],
                  default_ad_account: def && use.has(def) ? def : ([...use][0] ?? null),
                  ads_page: adsPage,
                  comment_pages: [...comments],
                }),
              )
            }
          >
            Save choices
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
