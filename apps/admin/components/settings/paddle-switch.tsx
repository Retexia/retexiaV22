"use client";

import { Switch } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { setOnlinePayments } from "@/app/(panel)/settings/paddle-actions";

export function OnlinePaymentsSwitch({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  return (
    <Switch
      checked={on}
      label="Customers pay online"
      description="On: right after the form, customers pay online and setup starts by itself. Off: requests wait for your review first."
      onCheckedChange={async (v) => {
        setOn(v);
        const r = await setOnlinePayments({ on: v });
        if (r.ok) toast.success(r.message ?? "Saved");
        else {
          toast.error(r.message);
          setOn(!v);
        }
        router.refresh();
      }}
    />
  );
}
