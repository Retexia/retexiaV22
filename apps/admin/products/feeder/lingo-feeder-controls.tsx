"use client";

import { Button, Field, Input, Select, Switch } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { checkLfPhotos, importLfCatalog, saveLfPrice, saveLfSettings, setLfSeller } from "./lingo-feeder-actions";

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const save = (fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Saved");
        after?.();
        router.refresh();
      } else toast.error(r.message ?? "Couldn't save");
    });
  return { pending, save };
}

export function LfSellerControls({ userId, budget, status, disabled }: { userId: string; budget: number | null; status: string; disabled: boolean }) {
  const [b, setB] = useState(budget == null ? "" : String(budget));
  const [s, setS] = useState(status);
  const { pending, save } = useSave();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="AI US$/month" className="w-28">
        <Input type="number" min={0} step="0.5" value={b} placeholder="default" onChange={(e) => setB(e.target.value)} disabled={disabled} />
      </Field>
      <Field label="Status" className="w-32">
        <Select value={s} onChange={(e) => setS(e.target.value)} disabled={disabled} options={[{ value: "setup", label: "Setting up" }, { value: "live", label: "On" }, { value: "paused", label: "Off" }, { value: "blocked", label: "Blocked" }]} />
      </Field>
      <Button size="sm" variant="secondary" disabled={disabled || pending} onClick={() => save(() => setLfSeller({ user_id: userId, budget: b, status: s as "live" }))}>Save</Button>
    </div>
  );
}

export function PriceRow({ row, disabled }: { row: { model: string; provider: "openai" | "gemini"; in_per_m: number; cached_per_m: number; out_per_m: number; audio_per_m: number | null }; disabled: boolean }) {
  const [v, setV] = useState({ in_per_m: String(row.in_per_m), cached_per_m: String(row.cached_per_m), out_per_m: String(row.out_per_m), audio_per_m: row.audio_per_m == null ? "" : String(row.audio_per_m) });
  const { pending, save } = useSave();
  return (
    <tr className="border-b border-line last:border-b-0">
      <td className="py-2 pr-2 font-mono type-small text-ink">{row.model}</td>
      {(["in_per_m", "cached_per_m", "out_per_m", "audio_per_m"] as const).map((k) => (
        <td key={k} className="py-2 pr-2">
          <Input aria-label={`${row.model} ${k}`} type="number" min={0} step="0.001" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} disabled={disabled} className="w-20" />
        </td>
      ))}
      <td className="py-2">
        <Button size="sm" variant="secondary" disabled={disabled || pending} onClick={() => save(() => saveLfPrice({ model: row.model, provider: row.provider, ...v }))}>Save</Button>
      </td>
    </tr>
  );
}

export function LfSettingsForm({ ai, allowance, money, disabled }: {
  ai: Record<string, string | boolean>; allowance: { usd?: number; cheap_until?: number };
  money: { usd_to_lkr?: number; fixed_costs_lkr?: number; payment_fee_pct?: number; target_margin_pct?: number }; disabled: boolean;
}) {
  const str = (k: string, d: string) => String(ai[k] ?? d);
  const [v, setV] = useState({
    brain: str("brain", "gpt-5.4-mini"), cheap: str("cheap", "gpt-5.4-nano"), ad_match: str("ad_match", "gpt-5.4-nano"), media: str("media", "gemini-3.5-flash-lite"),
    fallback: str("fallback", "gemini-3.5-flash-lite"), openai_reasoning: str("openai_reasoning", "none"), gemini_thinking: str("gemini_thinking", "minimal"),
    openai_cache_24h: ai.openai_cache_24h === true,
    usd: String(allowance.usd ?? 10), cheap_until: String(allowance.cheap_until ?? 2),
    usd_to_lkr: String(money.usd_to_lkr ?? 300), fixed_costs_lkr: String(money.fixed_costs_lkr ?? 9000), payment_fee_pct: String(money.payment_fee_pct ?? 3), target_margin_pct: String(money.target_margin_pct ?? 60),
  });
  const { pending, save } = useSave();
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save(() => saveLfSettings({
          ai: { brain: v.brain, cheap: v.cheap, ad_match: v.ad_match, media: v.media, fallback: v.fallback, openai_reasoning: v.openai_reasoning as "none", openai_cache_24h: v.openai_cache_24h, gemini_thinking: v.gemini_thinking as "minimal" },
          allowance: { usd: v.usd, cheap_until: v.cheap_until },
          money: { usd_to_lkr: v.usd_to_lkr, fixed_costs_lkr: v.fixed_costs_lkr, payment_fee_pct: v.payment_fee_pct, target_margin_pct: v.target_margin_pct },
        }));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Conversation (brain)" hint="OpenAI gpt-… or Gemini gemini-…"><Input value={v.brain} onChange={set("brain")} disabled={disabled} /></Field>
        <Field label="After the allowance" hint="Cheaper model"><Input value={v.cheap} onChange={set("cheap")} disabled={disabled} /></Field>
        <Field label="Which product an ad sells" hint="Once per ad"><Input value={v.ad_match} onChange={set("ad_match")} disabled={disabled} /></Field>
        <Field label="Voice notes and photos" hint="Gemini (Sinhala voice)"><Input value={v.media} onChange={set("media")} disabled={disabled} /></Field>
        <Field label="If OpenAI fails" hint="Gemini"><Input value={v.fallback} onChange={set("fallback")} disabled={disabled} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="OpenAI reasoning" hint="none = no hidden reasoning tokens">
          <Select value={v.openai_reasoning} onChange={set("openai_reasoning")} disabled={disabled} options={[{ value: "none", label: "none" }, { value: "minimal", label: "minimal" }, { value: "low", label: "low" }]} />
        </Field>
        <Field label="Gemini thinking" hint="minimal = cheapest">
          <Select value={v.gemini_thinking} onChange={set("gemini_thinking")} disabled={disabled} options={[{ value: "minimal", label: "minimal" }, { value: "low", label: "low" }]} />
        </Field>
        <Field label="AI allowance (US$ / seller / month)"><Input type="number" min={0} step="0.5" value={v.usd} onChange={set("usd")} disabled={disabled} /></Field>
        <Field label="Cheaper model up to (× allowance)"><Input type="number" min={1} max={10} step="0.5" value={v.cheap_until} onChange={set("cheap_until")} disabled={disabled} /></Field>
      </div>
      <Switch checked={v.openai_cache_24h} onCheckedChange={(x) => setV({ ...v, openai_cache_24h: x })} disabled={disabled} label="Keep OpenAI's prompt cache for 24 hours" description="Cheaper repeat input on models that support it; turn off if OpenAI rejects the requests." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="1 US$ in rupees"><Input type="number" min={1} value={v.usd_to_lkr} onChange={set("usd_to_lkr")} disabled={disabled} /></Field>
        <Field label="Fixed costs (Rs. / month)" hint="n8n server, Supabase share…"><Input type="number" min={0} value={v.fixed_costs_lkr} onChange={set("fixed_costs_lkr")} disabled={disabled} /></Field>
        <Field label="Payment fee %"><Input type="number" min={0} max={30} step="0.1" value={v.payment_fee_pct} onChange={set("payment_fee_pct")} disabled={disabled} /></Field>
        <Field label="Target margin %"><Input type="number" min={0} max={95} value={v.target_margin_pct} onChange={set("target_margin_pct")} disabled={disabled} /></Field>
      </div>
      <Button type="submit" disabled={disabled || pending} className="self-start">Save settings</Button>
      <p className="type-caption text-ink-muted">Texts, timings, follow-ups, banned claims and Lingo&apos;s extra style notes: Supabase → Table editor → lingo_feeder.settings.</p>
    </form>
  );
}

export function CatalogImport({ disabled }: { disabled: boolean }) {
  const { pending, save } = useSave();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const reset = () => (e.target as HTMLFormElement).reset();
        save(() => importLfCatalog(form), reset);
      }}
    >
      <Field label="Products CSV" className="min-w-0 flex-1">
        <Input type="file" name="file" accept=".csv,text/csv" disabled={disabled} />
      </Field>
      <Button type="submit" variant="secondary" disabled={disabled || pending}>{pending ? "Working…" : "Import"}</Button>
      <Button type="button" variant="ghost" disabled={disabled || pending} onClick={() => save(() => checkLfPhotos())}>Check photos</Button>
    </form>
  );
}
