"use client";

import { Button } from "@retexia/ui";
import { CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { approveDay } from "@/app/post/actions";

export function ApproveDay({ date, count }: { date: string; count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!count) return null;
  return (
    <Button
      size="sm"
      loading={busy}
      icon={<CheckCheck aria-hidden size={14} strokeWidth={1.5} />}
      onClick={async () => {
        setBusy(true);
        const r = await approveDay({ date });
        setBusy(false);
        toast[r.ok ? "success" : "error"](r.message ?? "");
        router.refresh();
      }}
    >
      Approve all ({count})
    </Button>
  );
}
