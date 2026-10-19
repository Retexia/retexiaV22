"use client";

import { Button } from "@retexia/ui";
import { ClipboardList } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { importFromOrder } from "@/app/post/actions";

/** Copies the details from the order form into the empty Brand fields. */
export function ImportFromOrder() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={busy}
      icon={<ClipboardList aria-hidden size={14} strokeWidth={1.5} />}
      onClick={async () => {
        setBusy(true);
        const r = await importFromOrder();
        setBusy(false);
        toast[r.ok ? "success" : "error"](r.message ?? "");
        // The form keeps its own state: reload so it shows the filled-in fields.
        if (r.ok) {
          router.refresh();
          window.location.reload();
        }
      }}
    >
      Fill in from my order
    </Button>
  );
}
