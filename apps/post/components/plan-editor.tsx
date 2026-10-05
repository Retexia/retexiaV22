"use client";

import { Alert, Badge, Button, Card, Dialog, Field, Input, Select, Switch, Textarea, cn } from "@retexia/ui";
import { Check, ImageOff, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deletePlanItem, saveOffer, saveWeekNote, setWeekPlan } from "@/app/actions";
import { FORMATS } from "@/lib/options";
import type { PostFormat } from "@/lib/post-db.types";

type Note = { id?: string; date: string; slot: number; note: string; format: PostFormat | null; media_id: string | null };
type Offer = { id?: string; title: string; details: string; price: string; discount: string; start_date: string; end_date: string; slots_per_day: number; media_id: string | null; active: boolean };
type Photo = { id: string; url: string | null; description: string | null };

export function PlanEditor({
  today,
  weekPlanAllowed,
  weekPlanEnabled,
  slots,
  days,
  notes,
  offers,
  library,
}: {
  today: string;
  weekPlanAllowed: boolean;
  weekPlanEnabled: boolean;
  slots: string[];
  days: { date: string; label: string }[];
  notes: Note[];
  offers: Offer[];
  library: Photo[];
}) {
  const router = useRouter();
  const [note, setNote] = useState<Note | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [busy, setBusy] = useState(false);
  const photo = (id: string | null) => library.find((m) => m.id === id);

  const finish = (r: { ok: boolean; message?: string }) => {
    toast[r.ok ? "success" : "error"](r.message ?? "");
    if (r.ok) router.refresh();
    return r.ok;
  };

  return (
    <div className="flex flex-col gap-8">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="type-h2 text-ink">Week plan</h2>
            <p className="type-small text-ink-muted">Write a short note for any slot (&ldquo;new chocolate cake, show the price&rdquo;). Empty slots are filled by the AI as usual.</p>
          </div>
          {weekPlanAllowed ? (
            <Switch checked={weekPlanEnabled} onCheckedChange={async (enabled) => finish(await setWeekPlan({ enabled }))} label="Use my week plan" />
          ) : (
            <Badge tone="neutral">Not in your plan</Badge>
          )}
        </div>
        {weekPlanAllowed && !weekPlanEnabled ? <Alert tone="info">The week plan is off, so these notes are saved but not used. Turn it on to use them.</Alert> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="w-28" />
                {slots.map((s) => (
                  <th key={s} className="type-label font-medium text-ink-muted">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date}>
                  <th scope="row" className="pr-2 text-left align-top type-label font-medium text-ink">
                    {d.label}
                  </th>
                  {[1, 2, 3].map((slot) => {
                    const n = notes.find((x) => x.date === d.date && x.slot === slot);
                    const p = photo(n?.media_id ?? null);
                    return (
                      <td key={slot} className="align-top">
                        <button
                          type="button"
                          disabled={!weekPlanAllowed}
                          onClick={() => setNote(n ?? { date: d.date, slot, note: "", format: null, media_id: null })}
                          className={cn(
                            "flex h-24 w-full flex-col items-start gap-1 overflow-hidden rounded-md border p-2 text-left transition-hover focus-visible:focus-ring disabled:opacity-50",
                            n ? "border-brand/40 bg-brand-soft/30" : "border-dashed border-line hover:border-line-strong",
                          )}
                        >
                          {n ? (
                            <>
                              <span className="line-clamp-2 type-small text-ink">{n.note || "Photo chosen"}</span>
                              <span className="mt-auto flex items-center gap-1.5">
                                {n.format ? <Badge tone="neutral">{FORMATS.find((f) => f.value === n.format)?.label}</Badge> : null}
                                {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL */}
                                {p?.url ? <img src={p.url} alt="" className="size-6 rounded-sm object-cover" /> : null}
                              </span>
                            </>
                          ) : (
                            <span className="m-auto type-caption text-ink-muted">AI decides</span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="type-h2 text-ink">Offers and special days</h2>
            <p className="type-small text-ink-muted">While an offer runs, it takes over the slots you choose and adds an &ldquo;ends …&rdquo; line.</p>
          </div>
          <Button
            icon={<Plus aria-hidden size={16} strokeWidth={1.5} />}
            onClick={() => setOffer({ title: "", details: "", price: "", discount: "", start_date: today, end_date: days[days.length - 1]!.date, slots_per_day: 1, media_id: null, active: true })}
          >
            Add offer
          </Button>
        </div>
        {offers.length ? (
          <Card padded={false}>
            <ul className="divide-y divide-line">
              {offers.map((o) => {
                const live = o.active && o.start_date <= today && o.end_date >= today;
                return (
                  <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <Tag aria-hidden size={18} strokeWidth={1.5} className="text-ink-muted" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="type-label text-ink">{o.title}</span>
                        {live ? <Badge tone="success">Running</Badge> : o.end_date < today ? <Badge tone="neutral">Ended</Badge> : !o.active ? <Badge tone="neutral">Off</Badge> : <Badge tone="brand">Upcoming</Badge>}
                      </span>
                      <span className="type-small text-ink-muted">
                        {o.start_date} to {o.end_date} · {o.slots_per_day} post{o.slots_per_day === 1 ? "" : "s"} a day{o.discount ? ` · ${o.discount}` : ""}
                        {o.price ? ` · ${o.price}` : ""}
                      </span>
                    </div>
                    <Button size="sm" variant="ghost" icon={<Pencil aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setOffer(o)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />}
                      onClick={async () => window.confirm(`Delete “${o.title}”?`) && finish(await deletePlanItem({ id: o.id! }))}
                    >
                      <span className="sr-only">Delete</span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : (
          <Card>
            <p className="type-body text-ink-muted">No offers yet. Add a sale, a new arrival or a holiday greeting.</p>
          </Card>
        )}
      </section>

      <Dialog
        open={Boolean(note)}
        onOpenChange={(o) => !o && setNote(null)}
        size="lg"
        title={note ? `${days.find((d) => d.date === note.date)?.label}, ${slots[note.slot - 1]}` : ""}
        description="Used as the idea for this post when tonight's posts are made."
        footer={
          <>
            {note?.id ? (
              <Button variant="ghost" className="mr-auto text-danger!" onClick={async () => note && finish(await saveWeekNote({ ...note, note: "", media_id: null })) && setNote(null)}>
                Clear
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setNote(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                if (!note) return;
                setBusy(true);
                const ok = finish(await saveWeekNote(note));
                setBusy(false);
                if (ok) setNote(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        {note ? (
          <div className="flex flex-col gap-4">
            <Field label="Note" hint="What should this post be about?">
              <Textarea rows={3} autoFocus value={note.note} maxLength={500} onChange={(e) => setNote({ ...note, note: e.target.value })} placeholder="New chocolate cake, show the price" />
            </Field>
            <Field label="Type" optionalLabel="Optional">
              <Select value={note.format ?? ""} onChange={(e) => setNote({ ...note, format: (e.target.value || null) as PostFormat | null })} options={FORMATS} placeholder="Let the AI decide" />
            </Field>
            <PhotoPicker library={library} value={note.media_id} onChange={(media_id) => setNote({ ...note, media_id })} />
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(offer)}
        onOpenChange={(o) => !o && setOffer(null)}
        size="lg"
        title={offer?.id ? "Edit offer" : "New offer"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOffer(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                if (!offer) return;
                setBusy(true);
                const ok = finish(await saveOffer(offer));
                setBusy(false);
                if (ok) setOffer(null);
              }}
            >
              Save offer
            </Button>
          </>
        }
      >
        {offer ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" required className="sm:col-span-2">
              <Input autoFocus value={offer.title} onChange={(e) => setOffer({ ...offer, title: e.target.value })} placeholder="Weekend cake sale" />
            </Field>
            <Field label="Details" className="sm:col-span-2" optionalLabel="Optional">
              <Textarea rows={2} value={offer.details} onChange={(e) => setOffer({ ...offer, details: e.target.value })} placeholder="All chocolate cakes, pre-order by Friday" />
            </Field>
            <Field label="Price" hint="Exactly as it should appear." optionalLabel="Optional">
              <Input value={offer.price} onChange={(e) => setOffer({ ...offer, price: e.target.value })} placeholder="LKR 3,500" />
            </Field>
            <Field label="Discount" optionalLabel="Optional">
              <Input value={offer.discount} onChange={(e) => setOffer({ ...offer, discount: e.target.value })} placeholder="20% off" />
            </Field>
            <Field label="Starts">
              <Input type="date" value={offer.start_date} onChange={(e) => setOffer({ ...offer, start_date: e.target.value })} />
            </Field>
            <Field label="Ends">
              <Input type="date" value={offer.end_date} min={offer.start_date} onChange={(e) => setOffer({ ...offer, end_date: e.target.value })} />
            </Field>
            <Field label="Posts a day about it">
              <Select value={String(offer.slots_per_day)} onChange={(e) => setOffer({ ...offer, slots_per_day: Number(e.target.value) || 1 })} options={["1", "2", "3"].map((v) => ({ value: v, label: v }))} />
            </Field>
            <div className="flex items-end pb-2">
              <Switch checked={offer.active} onCheckedChange={(active) => setOffer({ ...offer, active })} label="Offer is on" />
            </div>
            <div className="sm:col-span-2">
              <PhotoPicker library={library} value={offer.media_id} onChange={(media_id) => setOffer({ ...offer, media_id })} />
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function PhotoPicker({ library, value, onChange }: { library: Photo[]; value: string | null; onChange: (id: string | null) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 type-label text-ink">Photo (optional)</legend>
      {library.length ? (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {library.slice(0, 24).map((m) => (
            <li key={m.id}>
              <button
                type="button"
                aria-pressed={value === m.id}
                title={m.description ?? undefined}
                onClick={() => onChange(value === m.id ? null : m.id)}
                className={cn("relative block aspect-square w-full overflow-hidden rounded-md border-2 bg-surface-sunk focus-visible:focus-ring", value === m.id ? "border-brand" : "border-transparent")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL */}
                {m.url ? <img src={m.url} alt={m.description ?? ""} className="size-full object-cover" loading="lazy" /> : <ImageOff aria-hidden size={16} className="m-auto text-ink-muted" />}
                {value === m.id ? <Check aria-hidden size={16} strokeWidth={2} className="absolute top-1 right-1 rounded-full bg-brand p-0.5 text-on-brand" /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-small text-ink-muted">Add photos to your library to choose one here.</p>
      )}
    </fieldset>
  );
}
