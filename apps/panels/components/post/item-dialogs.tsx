"use client";

import { Button, Dialog, Field, Input, RadioCards, Select, Textarea } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { addPlaylistItem, editPublishedText, redoDesign, savePlaylistItem, setItemTime } from "@/app/post/playlist-actions";
import { CAPTION_LANGUAGES, DESIGN_LANGUAGES } from "@/lib/post/languages";
import { FocusSelect } from "./focus-select";

type Result = { ok: boolean; message?: string; fieldErrors?: Record<string, string> };

function useSubmit(onDone: () => void) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async (fn: () => Promise<Result>) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setErrors(r.ok ? {} : (r.fieldErrors ?? {}));
    if (!r.ok) {
      toast.error(r.message ?? "Something went wrong");
      return;
    }
    toast.success(r.message ?? "Saved");
    onDone();
    router.refresh();
  };
  return { busy, errors, submit };
}

const captionOptions = CAPTION_LANGUAGES.map((l) => ({ value: l.value, label: l.label }));
const designOptions = DESIGN_LANGUAGES.map((l) => ({ value: l.value, label: l.label }));

export type ItemDraft = { id?: string; title: string; prompt: string; time: string; caption_language: string; design_language: string; focus: string };

/** Write or change a playlist item's prompt, languages and time (new item: date + format given). */
export function ItemDialog({
  open,
  onOpenChange,
  initial,
  create,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: ItemDraft;
  create?: { date: string; format: "post" | "story" };
}) {
  const [v, setV] = useState(initial);
  const { busy, errors, submit } = useSubmit(() => onOpenChange(false));
  const story = create ? create.format === "story" : false;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={create ? `Add a ${create.format} to the playlist` : "Change this item"}
      description="Say what it should be about: the product, the offer, the feeling. The designer writes the captions and makes the picture in the languages you choose."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={() =>
              submit(() =>
                create
                  ? addPlaylistItem({ date: create.date, format: create.format, prompt: v.prompt, time: v.time || undefined, caption_language: v.caption_language, design_language: v.design_language, focus: v.focus })
                  : savePlaylistItem({ id: v.id!, title: v.title, prompt: v.prompt, time: v.time, caption_language: v.caption_language, design_language: v.design_language, focus: v.focus }),
              )
            }
          >
            {create ? "Add" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!create ? (
          <Field label="Title" hint="Only for you, to recognise it in the playlist." optionalLabel="Optional">
            <Input value={v.title} maxLength={120} onChange={(e) => setV({ ...v, title: e.target.value })} />
          </Field>
        ) : null}
        <FocusSelect value={v.focus} onChange={(focus) => setV({ ...v, focus })} />
        <Field label="What should it say?" error={errors.prompt} required>
          <Textarea
            rows={4}
            value={v.prompt}
            maxLength={1500}
            onChange={(e) => setV({ ...v, prompt: e.target.value })}
            placeholder={story ? "e.g. අද විතරයි! Chocolate cake 20% off, message us to order" : "e.g. New mango cake, Rs. 3,900 for 1 kg, order on WhatsApp"}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Captions in">
            <Select value={v.caption_language} onChange={(e) => setV({ ...v, caption_language: e.target.value || v.caption_language })} options={captionOptions} />
          </Field>
          <Field label="Text on the picture">
            <Select value={v.design_language} onChange={(e) => setV({ ...v, design_language: e.target.value || v.design_language })} options={designOptions} />
          </Field>
          <Field label="Time" error={errors.time}>
            <Input type="time" value={v.time} onChange={(e) => setV({ ...v, time: e.target.value })} />
          </Field>
        </div>
        {story ? <p className="type-small text-ink-muted">Stories have no caption on Facebook and Instagram, so only the text on the picture matters.</p> : null}
      </div>
    </Dialog>
  );
}

const CHANGES = [
  { value: "both", label: "Picture and caption" },
  { value: "image", label: "Only the picture" },
  { value: "caption", label: "Only the caption" },
  { value: "wrong_product", label: "Wrong product" },
];

/** A new version of a designed item (optionally with a changed prompt or languages). */
export function RedoDialog({
  open,
  onOpenChange,
  id,
  prompt,
  captionLanguage,
  designLanguage,
  focus,
  left,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  id: string;
  prompt: string;
  captionLanguage: string;
  designLanguage: string;
  focus: string;
  left: number;
}) {
  const [change, setChange] = useState("both");
  const [f, setF] = useState(focus);
  const [p, setP] = useState(prompt);
  const [cl, setCl] = useState(captionLanguage);
  const [dl, setDl] = useState(designLanguage);
  const { busy, submit } = useSubmit(() => onOpenChange(false));
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Make a new version"
      description={`${left} of 10 new versions left for this item. It is ready again in about a minute.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={() => submit(() => redoDesign({ id, change: change as "both", prompt: p.trim() && p.trim() !== prompt ? p : undefined, caption_language: cl, design_language: dl, focus: f !== focus ? f : undefined }))}
          >
            Make a new version
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="What should change?" labelAs="legend">
          <RadioCards name={`redo-${id}`} options={CHANGES} value={change} onChange={setChange} columns={2} compact />
        </Field>
        <FocusSelect value={f} onChange={setF} hint="Wrong product? Pick the right one here." />
        <Field label="What it should say" hint="Change it to steer the new version." optionalLabel="Optional">
          <Textarea rows={3} value={p} maxLength={1500} onChange={(e) => setP(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Captions in">
            <Select value={cl} onChange={(e) => setCl(e.target.value || cl)} options={captionOptions} />
          </Field>
          <Field label="Text on the picture">
            <Select value={dl} onChange={(e) => setDl(e.target.value || dl)} options={designOptions} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

export function TimeDialog({ open, onOpenChange, id, time }: { open: boolean; onOpenChange: (o: boolean) => void; id: string; time: string }) {
  const [t, setT] = useState(time);
  const { busy, submit } = useSubmit(() => onOpenChange(false));
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Change the time"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => submit(() => setItemTime({ id, time: t }))}>
            Move
          </Button>
        </>
      }
    >
      <Field label="New time (same day)">
        <Input type="time" value={t} onChange={(e) => setT(e.target.value)} />
      </Field>
    </Dialog>
  );
}

/** Change a published Facebook post's text. */
export function FacebookTextDialog({ open, onOpenChange, id, text }: { open: boolean; onOpenChange: (o: boolean) => void; id: string; text: string }) {
  const [t, setT] = useState(text);
  const { busy, submit } = useSubmit(() => onOpenChange(false));
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Edit the Facebook post"
      description="The change shows on Facebook straight away. Instagram doesn't let apps change a caption: to change it there, delete the post and make it again."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => submit(() => editPublishedText({ id, facebook: t }))}>
            Update on Facebook
          </Button>
        </>
      }
    >
      <Field label="Facebook text">
        <Textarea rows={8} value={t} maxLength={5000} onChange={(e) => setT(e.target.value)} />
      </Field>
    </Dialog>
  );
}
