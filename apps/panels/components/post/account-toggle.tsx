"use client";

import { Switch } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { setAccountEnabled } from "@/app/post/actions";

export function AccountToggle({ id, enabled, disabled }: { id: string; enabled: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  return (
    <Switch
      checked={on}
      disabled={disabled}
      label="Post here"
      onCheckedChange={async (v) => {
        setOn(v);
        const r = await setAccountEnabled({ id, enabled: v });
        toast[r.ok ? "success" : "error"](r.message ?? "");
        if (!r.ok) setOn(!v);
        router.refresh();
      }}
    />
  );
}
