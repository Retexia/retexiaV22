"use client";

import { Button, Dialog, Field, Input, Select, Textarea } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { publishCatalogEntry, setAdAccountStatus } from "./actions";

/** Confirm / stop one platform of a customer's Autopublish account. */
export function AdAccountButtons({ userId, platform, status, canManage }: { userId: string; platform: "meta" | "tiktok"; status: string; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!canManage || status === "none") return null;
  const set = async (s: "connected" | "problem") => {
    setBusy(true);
    const r = await setAdAccountStatus({ user_id: userId, platform, status: s, note });
    setBusy(false);
    if (!r.ok) return toast.error(r.message);
    toast.success(r.message ?? "Saved");
    setOpen(false);
    router.refresh();
  };
  return (
    <div className="flex flex-wrap gap-1">
      {status !== "connected" ? (
        <Button size="sm" onClick={() => setOpen(true)}>
          Confirm…
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => set("problem")} loading={busy}>
          Stop
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Confirm this ${platform === "meta" ? "Meta ad account" : "TikTok advertiser"}?`}
        description={
          platform === "meta"
            ? "Check in Business Manager → Partners that this customer's business shared the ad account (and Page) with Retexia, and add the ads System User to them (Manage campaigns; Page: Create ads + Leads). Then confirm: launches can spend on this account."
            : "Check in TikTok Business Center that the customer's business shared this advertiser with Retexia, and the app token covers it. Then confirm: launches can spend on this account."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => set("problem")} loading={busy}>
              Not yet / problem
            </Button>
            <Button onClick={() => set("connected")} loading={busy}>
              Confirm access
            </Button>
          </>
        }
      >
        <Field label="Note to the customer (optional)">
          <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Please also share the Page" />
        </Field>
      </Dialog>
    </div>
  );
}

/** An unknown platform error → a catalog entry (plain message + what to do). */
export function CatalogDraft({ id, note }: { id: number; note: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ category: "VALIDATION", action: "needs_client", client_message: "" });
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Write message…
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Teach Autopublish this error"
        description={note}
        footer={
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              const r = await publishCatalogEntry({ id, ...(v as { category: "VALIDATION"; action: "needs_client"; client_message: string }) });
              setBusy(false);
              if (!r.ok) return toast.error(r.message);
              toast.success(r.message ?? "Saved");
              setOpen(false);
              router.refresh();
            }}
          >
            Save
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kind">
              <Select
                value={v.category}
                onChange={(e) => setV({ ...v, category: e.target.value })}
                options={["TRANSIENT", "RATE_LIMIT", "AUTH", "PERMISSION", "ACCOUNT", "BILLING", "VALIDATION", "CREATIVE", "POLICY", "LIMIT"].map((c) => ({ value: c, label: c }))}
              />
            </Field>
            <Field label="What happens">
              <Select
                value={v.action}
                onChange={(e) => setV({ ...v, action: e.target.value })}
                options={[
                  { value: "retry", label: "Retry automatically" },
                  { value: "wait_rate_limit", label: "Wait for the limit" },
                  { value: "needs_client", label: "Ask the customer" },
                  { value: "needs_admin", label: "Hold for Retexia" },
                ]}
              />
            </Field>
          </div>
          <Field label="Message for the customer" hint="What happened, why, and exactly what to do. {user_msg} = Meta's own text.">
            <Textarea rows={3} value={v.client_message} onChange={(e) => setV({ ...v, client_message: e.target.value })} />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
