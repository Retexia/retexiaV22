"use client";

import { Button } from "@retexia/ui";
import { ConfirmDialog } from "@retexia/ui/admin";
import { Copy, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteTemplate, duplicateTemplate } from "@/app/feeder/(app)/autopublish/actions";

export function TemplateActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          const r = await duplicateTemplate({ id });
          setBusy(false);
          if (!r.ok) return toast.error(r.message);
          toast.success("Copied");
          router.refresh();
        }}
      >
        <Copy aria-hidden size={14} strokeWidth={1.75} /> Copy
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden size={14} strokeWidth={1.75} /> Delete
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete "${name}"?`}
        description="Launches made with it keep working; you just can't launch with it again."
        confirmLabel="Delete template"
        onConfirm={async () => {
          const r = await deleteTemplate({ id });
          if (!r.ok) return void toast.error(r.message);
          toast.success("Deleted");
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
