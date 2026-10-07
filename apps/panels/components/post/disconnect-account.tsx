"use client";

import { Button } from "@retexia/ui";
import { ConfirmDialog } from "@retexia/ui/admin";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { disconnectAccount } from "@/app/post/meta-actions";

export function DisconnectAccount({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Disconnect
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Disconnect ${name}?`}
        description="Post stops publishing there and deletes its access. Posts already published stay."
        confirmLabel="Disconnect"
        danger
        onConfirm={async () => {
          const r = await disconnectAccount({ id });
          setOpen(false);
          if (!r.ok) {
            toast.error(r.message);
            return;
          }
          toast.success(r.message ?? "Disconnected");
          router.refresh();
        }}
      />
    </>
  );
}
