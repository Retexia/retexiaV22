"use client";

import { Button, Card, Field, Switch, Textarea } from "@retexia/ui";
import { MessageCircle, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { sendCustomerMessage, setCustomerBotPaused } from "@/app/lingo/actions";

export function CustomerControls({ id, number, paused }: { id: number; number: string | null; paused: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(!paused);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="type-h3 text-ink">Take over</h2>
      <Switch
        checked={on}
        label={on ? "Lingo answers this customer" : "Lingo is stopped for this customer"}
        description="Turn off to reply to them yourself; Lingo stays quiet until you turn it back on."
        onCheckedChange={async (v) => {
          setOn(v);
          const r = await setCustomerBotPaused({ id, paused: !v });
          toast[r.ok ? "success" : "error"](r.message ?? "");
          if (!r.ok) setOn(!v);
          router.refresh();
        }}
      />
      {number ? (
        <Button href={`https://wa.me/${number}`} target="_blank" variant="secondary" size="sm" className="self-start" icon={<MessageCircle aria-hidden size={14} strokeWidth={1.5} />}>
          Open in WhatsApp
        </Button>
      ) : null}
      <Field label="Send a quick message" hint="Goes from your business WhatsApp number.">
        <Textarea rows={3} value={text} maxLength={1500} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Button
        size="sm"
        className="self-start"
        loading={busy}
        disabled={!text.trim()}
        icon={<Send aria-hidden size={14} strokeWidth={1.5} />}
        onClick={async () => {
          setBusy(true);
          const r = await sendCustomerMessage({ id, text });
          setBusy(false);
          toast[r.ok ? "success" : "error"](r.message ?? "");
          if (r.ok) setText("");
        }}
      >
        Send
      </Button>
    </Card>
  );
}
