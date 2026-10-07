"use client";

import { Button, Card, Checkbox } from "@retexia/ui";
import { FacebookIcon, InstagramIcon } from "@/components/post/brand-icons";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cancelMetaConnect, saveMetaAccounts } from "@/app/post/meta-actions";
import type { PageOption } from "@/lib/post/meta-connect";

/** After "Continue with Facebook": choose which Pages and Instagram accounts Post publishes to. */
export function MetaPicker({ connectId, pages, limit, used }: { connectId: string; pages: PageOption[]; limit: number; used: number }) {
  const router = useRouter();
  const [fb, setFb] = useState<string[]>(pages.length === 1 ? [pages[0]!.id] : []);
  const [ig, setIg] = useState<string[]>(pages.length === 1 && pages[0]!.instagram ? [pages[0]!.instagram.id] : []);
  const [busy, setBusy] = useState(false);
  const toggle = (list: string[], set: (v: string[]) => void, id: string, on: boolean) => set(on ? [...list, id] : list.filter((x) => x !== id));
  const picked = fb.length + ig.length;
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="type-h2 text-ink">Choose where Post publishes</h2>
        <p className="mt-1 type-body text-ink-muted">
          Your plan allows {limit} accounts ({used} already connected). Instagram accounts appear under the Page they are linked to.
        </p>
      </div>
      {pages.length ? (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {pages.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 p-4">
              <Checkbox
                checked={fb.includes(p.id)}
                onChange={(e) => toggle(fb, setFb, p.id, e.target.checked)}
                label={
                  <span className="flex items-center gap-2">
                    <FacebookIcon className="text-ink-muted" />
                    {p.name} <span className="type-small text-ink-muted">Facebook Page</span>
                  </span>
                }
              />
              {p.instagram ? (
                <Checkbox
                  checked={ig.includes(p.instagram.id)}
                  onChange={(e) => toggle(ig, setIg, p.instagram!.id, e.target.checked)}
                  label={
                    <span className="flex items-center gap-2">
                      <InstagramIcon className="text-ink-muted" />
                      {p.instagram.username ? `@${p.instagram.username}` : "Instagram"} <span className="type-small text-ink-muted">Instagram, linked to this Page</span>
                    </span>
                  }
                />
              ) : (
                <p className="pl-7 type-small text-ink-muted">No Instagram Business account is linked to this Page.</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-body text-ink-muted">
          This Facebook login manages no Pages, or you didn&apos;t allow Retexia to see them. Try again and tick your Page when Facebook asks.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          loading={busy}
          disabled={!picked}
          onClick={async () => {
            setBusy(true);
            const r = await saveMetaAccounts({ connectId, pages: fb, instagram: ig });
            setBusy(false);
            if (!r.ok) {
              toast.error(r.message);
              return;
            }
            toast.success(r.message ?? "Connected");
            router.replace("/accounts");
            router.refresh();
          }}
        >
          Connect {picked ? `${picked} account${picked === 1 ? "" : "s"}` : ""}
        </Button>
        <Button
          variant="secondary"
          onClick={async () => {
            await cancelMetaConnect({ connectId });
            router.replace("/accounts");
          }}
        >
          Cancel
        </Button>
      </div>
    </Card>
  );
}
