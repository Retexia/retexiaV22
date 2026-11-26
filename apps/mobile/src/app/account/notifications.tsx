import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Linking } from "react-native";
import { Screen } from "@/components/screen";
import { Alert, Button, Card, Divider, Section, SkeletonCard, SwitchRow, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { pushState, registerPush, type PushState } from "@/lib/push";
import { keys, useAction, useMe, usePrefs } from "@/lib/queries";

/** Notifications: the phone's permission, app notifications on/off, and which kinds. */
export default function NotificationsScreen() {
  const qc = useQueryClient();
  const me = useMe();
  const prefs = usePrefs();
  const [state, setState] = useState<PushState | null>(null);
  useFocusEffect(
    useCallback(() => {
      void pushState().then(setState);
    }, []),
  );
  const save = useAction((v: { push: boolean; muted: string[] }) => api<{ message: string | null }>("/notifications", { method: "PUT", body: v }), {
    invalidate: [keys.prefs],
    silent: true,
    haptic: false,
  });
  const open = (product: string | null) =>
    product === null || Boolean(me.data?.products.find((p) => p.key === product)?.open && (product !== "feeder" || me.data?.products.find((p) => p.key === "feeder")?.packages.some((k) => k.slug === "lingo-feeder" && k.open)));
  const p = prefs.data;
  const set = (next: { push?: boolean; muted?: string[] }) => {
    if (!p) return;
    const v = { push: next.push ?? p.push, muted: next.muted ?? p.muted };
    qc.setQueryData(keys.prefs, { ...p, ...v });
    save.mutate(v);
  };
  return (
    <Screen>
      {state === "denied" ? (
        <Alert tone="warning" title="Notifications are off for Retexia on this phone" action={<Button title="Open phone settings" size="sm" variant="secondary" onPress={() => void Linking.openSettings()} />}>
          Turn them on in your phone&apos;s settings to hear about calls and orders.
        </Alert>
      ) : null}
      {state === "undetermined" ? (
        <Alert tone="brand" title="Allow notifications" action={<Button title="Allow" size="sm" onPress={() => void registerPush(true).then(setState)} />}>
          Your phone asks once. You choose below which ones you get.
        </Alert>
      ) : null}
      {state === "unavailable" ? <Alert title="Notifications need a phone">They don&apos;t work in an emulator or on the web.</Alert> : null}

      {!p ? (
        prefs.error ? <Alert tone="danger" title="Couldn't load your settings">{prefs.error.message}</Alert> : <SkeletonCard lines={3} />
      ) : (
        <>
          <Card padded={false} style={{ paddingHorizontal: 16, gap: 0 }}>
            <SwitchRow title="App notifications" subtitle="On every phone you're signed in on" value={p.push} onChange={(v) => set({ push: v })} />
          </Card>
          <Section title="What you hear about">
            <Card padded={false} style={{ paddingHorizontal: 16, gap: 0 }}>
              {p.kinds.filter((k) => open(k.product)).map((k, i) => (
                <SwitchSlot key={k.key} first={i === 0}>
                  <SwitchRow
                    title={k.label}
                    subtitle={k.hint}
                    disabled={!p.push}
                    value={p.push && !p.muted.includes(k.key)}
                    onChange={(on) => set({ muted: on ? p.muted.filter((m) => m !== k.key) : [...p.muted, k.key] })}
                  />
                </SwitchSlot>
              ))}
            </Card>
          </Section>
          <Txt variant="small" color="inkMuted" style={{ paddingHorizontal: 4 }}>
            Emails about your account still come as before.
          </Txt>
        </>
      )}
    </Screen>
  );
}

function SwitchSlot({ first, children }: { first: boolean; children: React.ReactNode }) {
  return (
    <>
      {first ? null : <Divider />}
      {children}
    </>
  );
}
