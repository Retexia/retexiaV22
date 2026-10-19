"use client";

import { Badge, Button, Card, Checkbox } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { connectMetaPages, forgetMetaLogin } from "./meta-actions";

/** A Page from the staff member's Facebook login (no tokens: those stay on the server). */
export type PageChoice = { id: string; name: string; instagram: string | null; here: boolean; elsewhere: string | null };

/** Tick the customer's Page(s); only these are saved for this business. */
export function MetaPagePicker({ businessId, businessName, pages, backHref }: { businessId: string; businessName: string; pages: PageChoice[]; backHref: string }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(pages.filter((p) => p.here).map((p) => p.id));
  const [busy, setBusy] = useState(false);
  const toggle = (id: string, on: boolean) => setPicked((cur) => (on ? [...cur, id] : cur.filter((x) => x !== id)));

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="type-h3 text-ink">Which Page is {businessName}&apos;s?</h2>
        <p className="type-small text-ink-muted">
          This Facebook login manages {pages.length} Page{pages.length === 1 ? "" : "s"}. Tick only this customer&apos;s Page. Its linked Instagram Business account is added with it.
        </p>
      </div>
      {pages.length ? (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {pages.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <Checkbox
                label={p.name}
                description={p.instagram ? `Instagram @${p.instagram}` : "No Instagram Business account linked to this Page"}
                checked={picked.includes(p.id)}
                disabled={Boolean(p.elsewhere) || busy}
                onChange={(e) => toggle(p.id, e.target.checked)}
              />
              {p.elsewhere ? <Badge tone="warning">On another customer: {p.elsewhere}</Badge> : p.here ? <Badge tone="success">Already on this customer (reconnects)</Badge> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-body text-ink-muted">
          This Facebook login doesn&apos;t manage any Page (or no Page was allowed in the Facebook window). Ask the customer to give your Facebook account access to their Page, then log in again.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          loading={busy}
          disabled={!picked.length}
          onClick={async () => {
            setBusy(true);
            const r = await connectMetaPages({ businessId, pageIds: picked });
            setBusy(false);
            if (!r.ok) return toast.error(r.message);
            toast.success(r.message ?? "Connected");
            router.push(r.data?.to ?? backHref);
          }}
        >
          Connect {picked.length > 1 ? `${picked.length} Pages` : "this Page"} to {businessName}
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            await forgetMetaLogin();
            router.push(backHref);
          }}
        >
          Cancel
        </Button>
      </div>
    </Card>
  );
}
