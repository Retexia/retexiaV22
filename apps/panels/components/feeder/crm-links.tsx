"use client";

import { Button, Checkbox, Input } from "@retexia/ui";
import { Link2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { addCrmLink, removeCrmLink } from "@/app/feeder/actions";

const SHEET = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/(e\/)?[\w-]{20,}/;
/** "…/d/1AbC…xyz/edit#gid=0" → "1AbC…xyz · tab 0" (short, readable). */
const short = (l: string) => {
  const id = /\/d\/(?:e\/)?([\w-]+)/.exec(l)?.[1] ?? l;
  const gid = /[#&?]gid=(\d+)/.exec(l)?.[1];
  return `${id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id}${gid ? ` · tab ${gid}` : ""}`;
};

/**
 * The customer's CRM Google Sheet links, saved to their account. "Add CRM link"
 * saves a new one. With `selected`, each link has a tick box (use it this time).
 */
export function CrmLinks({ links, selected, onSelectedChange }: { links: string[]; selected?: string[]; onSelectedChange?: (links: string[]) => void }) {
  const router = useRouter();
  const [adding, setAdding] = useState(links.length === 0);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const bad = draft.trim() !== "" && !SHEET.test(draft.trim());

  async function save() {
    const link = draft.trim();
    if (!SHEET.test(link)) return;
    setBusy(true);
    const r = await addCrmLink({ link });
    setBusy(false);
    toast[r.ok ? "success" : "error"](r.message ?? "");
    if (!r.ok) return;
    setDraft("");
    setAdding(false);
    onSelectedChange?.([...(selected ?? []), link]);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {links.length ? (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {links.map((l) => (
            <li key={l} className="flex items-center gap-3 px-3 py-2">
              {selected && onSelectedChange ? (
                <Checkbox
                  aria-label={`Use ${short(l)} this time`}
                  checked={selected.includes(l)}
                  onChange={(e) => onSelectedChange(e.target.checked ? [...selected, l] : selected.filter((x) => x !== l))}
                />
              ) : (
                <Link2 aria-hidden size={16} strokeWidth={1.5} className="shrink-0 text-ink-muted" />
              )}
              <a href={l} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate type-body text-link" title={l}>
                Google Sheet {short(l)}
              </a>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />}
                onClick={async () => {
                  if (!window.confirm("Remove this CRM link from your account?")) return;
                  const r = await removeCrmLink({ link: l });
                  toast[r.ok ? "success" : "error"](r.message ?? "");
                  onSelectedChange?.((selected ?? []).filter((x) => x !== l));
                  router.refresh();
                }}
              >
                <span className="sr-only">Remove this link</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap gap-2">
            <Input
              autoFocus={links.length > 0}
              aria-label="New CRM Google Sheet link"
              placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void save();
                }
              }}
              className="min-w-0 flex-1"
            />
            <Button loading={busy} disabled={!draft.trim() || bad} onClick={save}>
              Save link
            </Button>
            {links.length ? (
              <Button variant="ghost" disabled={busy} onClick={() => {
                  setAdding(false);
                  setDraft("");
                }}>
                Cancel
              </Button>
            ) : null}
          </div>
          {bad ? <p className="type-small text-danger">This isn&apos;t a Google Sheet link.</p> : null}
        </div>
      ) : (
        <Button variant="secondary" size="sm" className="self-start" disabled={links.length >= 20} icon={<Plus aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setAdding(true)}>
          Add CRM link
        </Button>
      )}
    </div>
  );
}
