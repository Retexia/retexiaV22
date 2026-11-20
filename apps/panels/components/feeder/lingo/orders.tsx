"use client";

import { Button } from "@retexia/ui";
import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { setOrderExport } from "@/app/feeder/(app)/lingo/actions";
import { useAction } from "./common";

/** Downloads the courier CSV (new confirmed orders) and marks them as sent to Feeder. */
export function CourierButton({ count }: { count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={busy || !count}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch("/lingo/orders/csv?kind=courier", { cache: "no-store" });
          if (!res.ok) {
            toast.error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't make the file.");
            return;
          }
          const name = /filename="?([^";]+)"?/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "orders.csv";
          const url = URL.createObjectURL(await res.blob());
          const a = Object.assign(document.createElement("a"), { href: url, download: name });
          document.body.append(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          toast.success(`${res.headers.get("x-lingo-orders") ?? count} orders in ${name}. Upload it on Feeder like your other courier files.`);
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download aria-hidden size={16} strokeWidth={1.75} />
      {busy ? "Making the file…" : `Courier CSV (${count})`}
    </Button>
  );
}

export function ExportToggle({ id, done }: { id: number; done: boolean }) {
  const { pending, go } = useAction();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => go(() => setOrderExport({ id, pending: done }))}>
      {done ? "Put in next file" : "Mark as sent"}
    </Button>
  );
}
