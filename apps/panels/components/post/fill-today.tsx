"use client";

import { Button } from "@retexia/ui";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { fillToday } from "@/app/post/playlist-actions";

/** Fills today's empty playlist slots now and starts designing them. */
export function FillToday({ empty }: { empty: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      loading={busy}
      icon={<Sparkles aria-hidden size={14} strokeWidth={1.5} />}
      onClick={async () => {
        setBusy(true);
        const r = await fillToday();
        setBusy(false);
        toast[r.ok ? "success" : "error"](r.message ?? "");
        router.refresh();
      }}
    >
      Fill today ({empty})
    </Button>
  );
}
