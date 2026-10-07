"use client";

import { Alert, Badge, Button, Card, Field, Input } from "@retexia/ui";
import { ConfirmDialog } from "@retexia/ui/admin";
import { CircleCheck, QrCode, RefreshCw, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { disconnectWhatsApp, getWhatsAppCode, getWhatsAppState, type ConnectCode } from "@/app/lingo/whatsapp-actions";
import type { WaState } from "@/lib/lingo/evolution";

const STATE_LABEL: Record<WaState, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  open: { label: "Connected", tone: "success" },
  connecting: { label: "Waiting for your phone", tone: "warning" },
  close: { label: "Not connected", tone: "danger" },
  unknown: { label: "Unknown", tone: "neutral" },
};

/** Link the business's WhatsApp to Lingo: scan a QR code, or type a pairing code. */
export function WhatsAppConnect({ initialState, number, onboarding = false }: { initialState: WaState; number: string; onboarding?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<WaState>(initialState);
  const [code, setCode] = useState<ConnectCode | null>(null);
  const [mode, setMode] = useState<"qr" | "phone">("qr");
  const [phone, setPhone] = useState(number);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const linking = useRef(false);

  const load = useCallback(
    async (withPhone?: string) => {
      setBusy(true);
      setError(null);
      const r = await getWhatsAppCode(withPhone ? { phone: withPhone } : {});
      setBusy(false);
      if (!r.ok) return setError(r.message);
      if (r.data?.state === "open") {
        setState("open");
        return;
      }
      linking.current = true;
      setCode(r.data ?? null);
      setState("connecting");
    },
    [],
  );

  // While linking: check every 3 s; a QR code expires after ~40 s, so fetch a new one every 30 s.
  useEffect(() => {
    if (state === "open" || !code) return;
    const poll = window.setInterval(async () => {
      const r = await getWhatsAppState();
      if (r.ok && r.data === "open") {
        setState("open");
        setCode(null);
        linking.current = false;
        toast.success("WhatsApp connected. Lingo is answering now.");
        router.refresh();
        if (onboarding) router.push("/");
      }
    }, 3000);
    const refresh = mode === "qr" ? window.setInterval(() => void load(), 30_000) : undefined;
    return () => {
      window.clearInterval(poll);
      if (refresh) window.clearInterval(refresh);
    };
  }, [state, code, mode, load, router, onboarding]);

  const s = STATE_LABEL[state];
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="type-h2 text-ink">WhatsApp</h2>
        <Badge tone={s.tone}>{s.label}</Badge>
      </div>

      {state === "open" ? (
        <div className="flex flex-col gap-4">
          <p className="flex items-start gap-2 type-body text-ink">
            <CircleCheck aria-hidden size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-success" />
            Your WhatsApp is linked. Lingo reads new messages and answers them for you.
          </p>
          <div className="flex flex-wrap gap-2">
            {onboarding ? <Button href="/">Go to my panel</Button> : null}
            <Button variant="secondary" onClick={() => setConfirm(true)}>
              Unlink this phone
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 type-body text-ink-muted">
            <li>Open WhatsApp (or WhatsApp Business) on the phone with your business number.</li>
            <li>Tap the menu (⋮) or Settings, then <strong className="text-ink">Linked devices</strong> → <strong className="text-ink">Link a device</strong>.</li>
            <li>{mode === "qr" ? "Point the phone at the code below." : "Choose “Link with phone number instead” and type the code below."}</li>
          </ol>

          {error ? <Alert tone="danger">{error}</Alert> : null}

          {code ? (
            mode === "qr" && code.qr ? (
              <div className="flex flex-col items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL from the WhatsApp server */}
                <img src={code.qr} alt="WhatsApp QR code" className="size-64 rounded-md bg-white p-2" />
                <p className="type-small text-ink-muted">The code refreshes by itself. Keep this page open until it says Connected.</p>
              </div>
            ) : code.pairingCode ? (
              <div className="flex flex-col items-center gap-2">
                <p className="font-mono text-[32px] tracking-[0.3em] text-ink">{code.pairingCode}</p>
                <p className="type-small text-ink-muted">Type this code on your phone. It works for a few minutes.</p>
              </div>
            ) : (
              <Alert tone="warning">The WhatsApp server didn&apos;t send a code. Try again.</Alert>
            )
          ) : null}

          <div className="flex flex-wrap items-end gap-3">
            {mode === "qr" ? (
              <>
                <Button loading={busy} icon={code ? <RefreshCw aria-hidden size={16} strokeWidth={1.5} /> : <QrCode aria-hidden size={16} strokeWidth={1.5} />} onClick={() => load()}>
                  {code ? "New code" : "Show QR code"}
                </Button>
                <Button variant="ghost" icon={<Smartphone aria-hidden size={16} strokeWidth={1.5} />} onClick={() => { setMode("phone"); setCode(null); }}>
                  Use a code instead (one phone only)
                </Button>
              </>
            ) : (
              <>
                <Field label="Your business WhatsApp number" hint="With country code, e.g. 94771234567" className="min-w-60 flex-1">
                  <Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>
                <Button loading={busy} disabled={phone.replace(/\D/g, "").length < 9} onClick={() => load(phone.replace(/\D/g, ""))}>
                  Get code
                </Button>
                <Button variant="ghost" onClick={() => { setMode("qr"); setCode(null); }}>
                  Scan a QR code instead
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Unlink this phone?"
        description="Lingo stops answering until you link a phone again. Your products, settings and customers stay."
        confirmLabel="Unlink"
        danger
        onConfirm={async () => {
          const r = await disconnectWhatsApp();
          setConfirm(false);
          if (!r.ok) {
            toast.error(r.message);
            return;
          }
          toast.success(r.message ?? "Unlinked");
          setState("close");
          router.refresh();
        }}
      />
    </Card>
  );
}
