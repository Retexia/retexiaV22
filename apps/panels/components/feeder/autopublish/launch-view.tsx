"use client";

import { Alert, Badge, Button, Card, Checkbox, Dialog, Field, Input, Textarea } from "@retexia/ui";
import { ExternalLink, Pause, Play, RotateCcw, ThumbsDown, ThumbsUp, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { approveLaunch, rejectLaunch, resubmitAd, retryLaunchAction, setLaunchPaused } from "@/app/feeder/(app)/autopublish/actions";
import { money, PLATFORM_LONG, type Platform } from "@/lib/feeder/autopublish/plan";
import type { CreativeView } from "@/lib/feeder/autopublish/data";
import type { EventRow, LaunchRow, NodeRow } from "@/lib/feeder/autopublish/types";
import { LAUNCH_STATE, LEVEL_LABEL, NODE_STATE, timeAgo } from "./labels";
import { Thumb } from "./launch-studio";

const LIVE_STATES = ["queued", "building", "activating", "in_review"];
const MAX_RESUBMITS = 2;

function adsManagerLink(n: NodeRow, ids: { meta: string | null; tiktok: string | null }) {
  if (!n.platform_id) return null;
  if (n.platform === "meta" && ids.meta) {
    const tab = n.level === "campaign" ? "campaigns" : n.level === "adset" ? "adsets" : n.level === "ad" ? "ads" : null;
    if (!tab) return null;
    const sel = n.level === "campaign" ? "selected_campaign_ids" : n.level === "adset" ? "selected_adset_ids" : "selected_ad_ids";
    return `https://adsmanager.facebook.com/adsmanager/manage/${tab}?act=${ids.meta}&${sel}=${n.platform_id}`;
  }
  if (n.platform === "tiktok" && ids.tiktok && ["campaign", "adset", "ad"].includes(n.level)) return `https://ads.tiktok.com/i18n/perf/${n.level === "adset" ? "adgroup" : n.level}?aadvid=${ids.tiktok}`;
  return null;
}

function NodeLine({ n, ids, onFix }: { n: NodeRow; ids: { meta: string | null; tiktok: string | null }; onFix?: (n: NodeRow) => void }) {
  const s = NODE_STATE[n.state] ?? { label: n.state, tone: "neutral" as const };
  const link = adsManagerLink(n, ids);
  const kind = LEVEL_LABEL[n.level]?.[n.platform] ?? n.level;
  const budget = n.budget_daily != null ? `${money(n.budget_daily)}/day` : n.budget_lifetime != null ? `${money(n.budget_lifetime)} total` : null;
  return (
    <div className="flex flex-col gap-1 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="type-small text-ink-muted">{kind}</span>
        <span className="min-w-0 type-body text-ink">{n.name}</span>
        {n.action !== "create" ? <Badge tone="neutral">{n.action === "slot" ? (n.platform_extra.existed ? "evergreen, kept" : "evergreen, new") : "existing"}</Badge> : null}
        <Badge tone={s.tone}>{s.label}</Badge>
        {budget ? <span className="type-small text-ink-muted">{budget}</span> : null}
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 type-small text-brand hover:underline">
            Open <ExternalLink aria-hidden size={12} />
          </a>
        ) : null}
      </div>
      {n.error_message && !["done", "live", "in_review"].includes(n.state) ? <p className="type-small text-danger">{n.error_message}</p> : null}
      {n.state === "retry_wait" ? <p className="type-small text-ink-muted">Trying again at {new Date(n.next_run_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.</p> : null}
      {onFix && n.level === "ad" && n.platform === "meta" && ["disapproved", "with_issues"].includes(n.state) && n.resubmits < MAX_RESUBMITS ? (
        <div>
          <Button size="sm" variant="secondary" onClick={() => onFix(n)}>
            <Wrench aria-hidden size={14} strokeWidth={1.75} /> Fix &amp; resubmit
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** One launch: status, what was made on each platform, its timeline, and what you can do now. */
export function LaunchView({ launch, nodes, creatives, events, ids }: { launch: LaunchRow; nodes: NodeRow[]; creatives: CreativeView[]; events: EventRow[]; ids: { meta: string | null; tiktok: string | null } }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<number[]>(creatives.map((c) => c.position));
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [fixing, setFixing] = useState<NodeRow | null>(null);
  const copy = launch.snapshot.template.copy;
  const [text, setText] = useState({ primary_text: copy.primary_text, headline: copy.headline, description: copy.description });
  const s = LAUNCH_STATE[launch.state] ?? { label: launch.state, tone: "neutral" as const };

  // While it's being built or reviewed, refresh every 10 seconds.
  useEffect(() => {
    if (!LIVE_STATES.includes(launch.state)) return;
    const t = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(t);
  }, [launch.state, router]);

  const act = async (name: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(name);
    const r = await fn();
    setBusy(null);
    if (!r.ok) return toast.error(r.message ?? "Something went wrong.");
    toast.success(r.message ?? "Done");
    router.refresh();
  };

  const platforms = [...new Set(nodes.map((n) => n.platform))] as Platform[];
  const order = { media: 0, form: 1, campaign: 2, adset: 3, creative: 4, ad: 5 } as const;
  const hasProblem = nodes.some((n) => ["needs_fix", "failed", "blocked"].includes(n.state));
  // Pause only when something this launch made is switched on.
  const running = ["in_review", "live", "partly_live", "needs_attention"].includes(launch.state) && nodes.some((n) => n.level === "ad" && n.platform_extra.activated && ["in_review", "live", "scheduled", "with_issues", "disapproved"].includes(n.state));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="type-code text-ink-muted">{launch.ref}</p>
              <h2 className="type-h2 text-ink">{launch.product_name}</h2>
              <p className="type-small text-ink-muted">
                Form name <span className="text-ink">{launch.form_name}</span>
                {launch.template_name ? <> · template {launch.template_name}</> : null} · {new Date(launch.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <Badge tone={s.tone}>{s.label}</Badge>
          </div>
          <p className="type-body text-ink">{launch.summary}</p>
          {launch.problem ? <Alert tone={launch.state === "blocked" ? "danger" : "warning"}>{launch.problem.message}</Alert> : null}
          {launch.state === "awaiting_approval" ? (
            <div className="flex flex-col gap-3 rounded-md border border-warning/30 bg-warning-soft p-4">
              <p className="type-body text-ink">
                Waiting for approval (code <span className="type-code">{launch.approval_code}</span>). Untick a creative to leave it out.
              </p>
              <div className="flex flex-wrap gap-4">
                {creatives.map((c) => (
                  <Checkbox key={c.position} label={`#${c.position} ${c.name}`} checked={picked.includes(c.position)} onChange={(e) => setPicked((x) => (e.target.checked ? [...x, c.position] : x.filter((p) => p !== c.position)))} />
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => act("approve", () => approveLaunch({ ref: launch.ref, positions: picked }))} loading={busy === "approve"} disabled={!picked.length || Boolean(busy)}>
                  <ThumbsUp aria-hidden size={16} strokeWidth={1.75} /> Approve {picked.length === creatives.length ? "all" : `${picked.length}`}
                </Button>
                <Button variant="secondary" onClick={() => setRejecting(true)} disabled={Boolean(busy)}>
                  <ThumbsDown aria-hidden size={16} strokeWidth={1.75} /> Reject
                </Button>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {hasProblem || ["failed", "blocked"].includes(launch.state) ? (
              <Button variant="secondary" size="sm" onClick={() => act("retry", () => retryLaunchAction({ ref: launch.ref }))} loading={busy === "retry"} disabled={Boolean(busy)}>
                <RotateCcw aria-hidden size={14} strokeWidth={1.75} /> Retry
              </Button>
            ) : null}
            {running ? (
              <Button variant="secondary" size="sm" onClick={() => act("pause", () => setLaunchPaused({ ref: launch.ref, paused: true }))} loading={busy === "pause"} disabled={Boolean(busy)}>
                <Pause aria-hidden size={14} strokeWidth={1.75} /> Pause
              </Button>
            ) : null}
            {launch.state === "paused" ? (
              <Button size="sm" onClick={() => act("resume", () => setLaunchPaused({ ref: launch.ref, paused: false }))} loading={busy === "resume"} disabled={Boolean(busy)}>
                <Play aria-hidden size={14} strokeWidth={1.75} /> Switch on
              </Button>
            ) : null}
            {launch.state === "queued" ? (
              <Button variant="ghost" size="sm" onClick={() => act("cancel", () => rejectLaunch({ ref: launch.ref, reason: "Cancelled" }))} disabled={Boolean(busy)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </Card>

        {platforms.map((p) => {
          const list = nodes.filter((n) => n.platform === p && n.state !== "skipped").sort((a, b) => order[a.level] - order[b.level] || a.key.localeCompare(b.key, "en", { numeric: true }));
          const skipped = nodes.filter((n) => n.platform === p && n.state === "skipped").length;
          return (
            <Card key={p} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="type-h3 text-ink">{PLATFORM_LONG[p]}</h2>
                {launch.totals[p] ? <span className="type-label text-ink">{money(launch.totals[p], launch.snapshot.currency)}/day</span> : null}
              </div>
              <div className="divide-y divide-line">
                {list.map((n) => (
                  <NodeLine key={n.id} n={n} ids={ids} onFix={setFixing} />
                ))}
              </div>
              {skipped ? <p className="type-small text-ink-muted">{skipped} step(s) skipped (creatives left out at approval).</p> : null}
            </Card>
          );
        })}
      </div>

      <aside className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <h2 className="type-h3 text-ink">Creatives</h2>
          <ul className="grid grid-cols-2 gap-2">
            {creatives.map((c) => (
              <li key={c.position} className={`flex flex-col gap-1 ${c.approved ? "" : "opacity-50"}`}>
                <div className="aspect-square overflow-hidden rounded-sm bg-surface-sunk">
                  {c.url ? <Thumb kind={c.kind} src={c.url} controls /> : null}
                </div>
                <span className="truncate type-small text-ink">
                  #{c.position} {c.name}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        {launch.warnings.length ? (
          <Alert tone="warning" title="Noted at launch">
            <ul className="flex list-disc flex-col gap-1 pl-4">
              {launch.warnings.slice(0, 6).map((w) => (
                <li key={w.field + w.message}>{w.message}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        <Card className="flex flex-col gap-3">
          <h2 className="type-h3 text-ink">Timeline</h2>
          <ol className="flex flex-col gap-3">
            {events.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5">
                <span className="type-small text-ink-muted">{timeAgo(e.created_at)}</span>
                <span className="type-small text-ink">{e.message}</span>
              </li>
            ))}
          </ol>
        </Card>
      </aside>

      <Dialog
        open={rejecting}
        onOpenChange={setRejecting}
        title="Reject this launch?"
        description="Nothing is published. You can launch again any time."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(false)}>
              Back
            </Button>
            <Button
              variant="danger"
              loading={busy === "reject"}
              onClick={() =>
                act("reject", async () => {
                  const r = await rejectLaunch({ ref: launch.ref, reason });
                  if (r.ok) setRejecting(false);
                  return r;
                })
              }
            >
              Reject
            </Button>
          </>
        }
      >
        <Field label="Why (optional)">
          <Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Dialog>

      <Dialog
        open={Boolean(fixing)}
        onOpenChange={(o) => !o && setFixing(null)}
        size="lg"
        title="Fix & resubmit"
        description={fixing ? `${fixing.error_message ?? ""} Resubmitted ${fixing.resubmits} of ${MAX_RESUBMITS} times.` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFixing(null)}>
              Back
            </Button>
            <Button
              loading={busy === "resubmit"}
              onClick={() =>
                fixing &&
                act("resubmit", async () => {
                  const r = await resubmitAd({ ref: launch.ref, node_id: fixing.id, copy: text });
                  if (r.ok) setFixing(null);
                  return r;
                })
              }
            >
              Resubmit
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="type-small text-ink-muted">Change what Meta mentioned. An unchanged ad is never resubmitted (repeated rejections hurt your ad account).</p>
          <Field label="Main text" required>
            <Textarea rows={4} value={text.primary_text} onChange={(e) => setText({ ...text, primary_text: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Headline">
              <Input value={text.headline} onChange={(e) => setText({ ...text, headline: e.target.value })} />
            </Field>
            <Field label="Description">
              <Input value={text.description} onChange={(e) => setText({ ...text, description: e.target.value })} />
            </Field>
          </div>
          <p className="type-small text-ink-muted">To change the video or image itself, launch again with the new file.</p>
        </div>
      </Dialog>
    </div>
  );
}
