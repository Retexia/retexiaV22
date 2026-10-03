"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { removeFromWaitlist } from "@/app/(panel)/inbox/actions";

export function WaitlistRemove({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        if (!window.confirm("Remove this email from the waitlist?")) return;
        const r = await removeFromWaitlist({ id });
        toast[r.ok ? "success" : "error"](r.message ?? "");
        router.refresh();
      }}
      className="inline-flex size-6 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunk hover:text-danger focus-visible:focus-ring"
    >
      <X aria-hidden size={14} strokeWidth={1.5} />
      <span className="sr-only">Remove</span>
    </button>
  );
}
