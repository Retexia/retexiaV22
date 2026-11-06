"use client";

import { DropdownMenu } from "@retexia/ui";
import { CalendarPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { extendTrial } from "@/app/(panel)/requests/actions";

/** "Free trial until 20 Nov" + Extend (+3 / +7 / +14 days). */
export function ExtendTrial({ orderId, orderRef, endsAt }: { orderId: string; orderRef: string; endsAt: string | null }) {
  const router = useRouter();
  const when = endsAt ? new Date(endsAt).toLocaleDateString("en-LK", { day: "numeric", month: "short" }) : "";
  return (
    <DropdownMenu
      align="end"
      triggerLabel="Extend free trial"
      triggerClassName="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface-raised px-3 type-label text-ink hover:bg-surface-sunk focus-visible:focus-ring"
      trigger={
        <>
          <CalendarPlus aria-hidden size={16} strokeWidth={1.5} />
          {when ? `Trial until ${when}` : "Free trial"} · Extend
        </>
      }
      items={[3, 7, 14].map((days) => ({
        type: "button" as const,
        label: `+${days} days`,
        onSelect: async () => {
          const r = await extendTrial({ orderId, ref: orderRef, days });
          toast[r.ok ? "success" : "error"](r.message ?? "");
          router.refresh();
        },
      }))}
    />
  );
}
