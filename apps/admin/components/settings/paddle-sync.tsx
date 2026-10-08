"use client";

import { Button } from "@retexia/ui";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { syncPaddleCatalog } from "@/app/(panel)/settings/paddle-actions";

export function PaddleSyncButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={disabled}
      loading={busy}
      icon={<RefreshCw aria-hidden size={16} strokeWidth={1.5} />}
      onClick={async () => {
        setBusy(true);
        const r = await syncPaddleCatalog();
        setBusy(false);
        if (r.ok) toast.success(r.message ?? "Synced");
        else toast.error(r.message, { duration: 10_000 });
        router.refresh();
      }}
    >
      Sync plans to Paddle
    </Button>
  );
}
