import type { LfMessage, LfOrder } from "@retexia/shared/app-api";
import { LANG, SET_STATUSES, isPaused, lkr, showPhone, statusOf, telPhone, when } from "@retexia/shared/lingo-feeder";
import { Stack, useLocalSearchParams } from "expo-router";
import { Check, Phone, SendHorizontal } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bubble } from "@/components/chat";
import { RetexiaLoader } from "@/components/loader";
import { Alert, Badge, Button, Card, Icon, IconButton, Input, Txt } from "@/components/ui";
import { keys, lfApi, useAction, useLfThread } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

/** One customer's chat, as on WhatsApp, with what the seller can do about it. */
export default function Thread() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useLfThread(phone);
  const [text, setText] = useState("");
  const [picking, setPicking] = useState(false);
  const invalidate = [keys.lf];
  const called = useAction((v: boolean) => lfApi.chat(phone, "called", { called: v }), { invalidate });
  const pause = useAction((v: boolean) => lfApi.chat(phone, "pause", { paused: v }), { invalidate });
  const setStatus = useAction((s: string) => lfApi.chat(phone, "status", { status: s }), { invalidate });
  const reply = useAction((body: string) => lfApi.chat(phone, "reply", { text: body }), { invalidate, onDone: () => setText("") });
  const d = t.data;
  const ch = d?.chat;
  const name = ch?.details.name || ch?.profile_name || showPhone(phone);
  const paused = isPaused(ch?.paused_until);
  const newest = useMemo(() => [...(d?.messages ?? [])].reverse(), [d?.messages]);
  const call = () => void Linking.openURL(`tel:${telPhone(ch?.details.phone || phone)}`);

  if (!d) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 16 }}>
        <Stack.Screen options={{ title: showPhone(phone) }} />
        {t.error ? <Alert tone="danger" title="Couldn't open the chat">{t.error.message}</Alert> : <RetexiaLoader />}
      </View>
    );
  }
  const st = statusOf(ch!.status);
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.surfaceSunk }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
      <Stack.Screen options={{ title: name, headerRight: () => <IconButton icon={Phone} label={`Call ${name}`} onPress={call} color="brand" /> }} />

      <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.line, paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Change the chat's status" onPress={() => setPicking(true)} style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Badge tone={st.tone}>{st.label}</Badge>
          <Txt variant="small" color="inkMuted">
            {[showPhone(phone), LANG[ch!.lang], d.product?.name].filter(Boolean).join(" · ")}
          </Txt>
          <Txt variant="small" color="link">
            Change
          </Txt>
        </Pressable>
        {ch!.needs_call ? (
          <Alert
            tone="danger"
            title="📞 Call them"
            action={
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button title="Call" size="sm" icon={Phone} onPress={call} />
                <Button title="Called" size="sm" variant="secondary" icon={Check} loading={called.isPending} onPress={() => called.mutate(true)} />
              </View>
            }
          >
            {ch!.call_reason ?? "Asked for a call"}
          </Alert>
        ) : null}
        {paused ? (
          <Alert tone="warning" title="You're answering this chat" action={<Button title="Let Lingo answer" size="sm" variant="secondary" loading={pause.isPending} onPress={() => pause.mutate(false)} />}>
            Lingo stays quiet here.
          </Alert>
        ) : null}
      </View>

      <FlatList
        inverted
        data={newest}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ padding: 12, gap: 10 }}
        renderItem={({ item }) => <MessageBubble m={item} />}
        ListFooterComponent={d.orders.length ? <Orders orders={d.orders} /> : undefined}
      />

      <View style={{ backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line, padding: 10, paddingBottom: insets.bottom + 10, gap: 6 }}>
        {d.canReply ? (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
            <Input value={text} onChangeText={setText} placeholder="Write your own reply" multiline maxLength={4000} style={{ flex: 1, maxHeight: 120 }} accessibilityLabel="Your reply" />
            <IconButton icon={SendHorizontal} label="Send" tone="brand" disabled={!text.trim() || reply.isPending} onPress={() => reply.mutate(text.trim())} />
          </View>
        ) : (
          <Txt variant="small" color="inkMuted" style={{ textAlign: "center" }}>
            WhatsApp only allows a reply within 24 hours of the customer&apos;s last message. Call them instead.
          </Txt>
        )}
        {!paused ? (
          <Pressable onPress={() => pause.mutate(true)} style={{ alignSelf: "center" }}>
            <Txt variant="small" color="link">
              Pause Lingo in this chat
            </Txt>
          </Pressable>
        ) : null}
      </View>

      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" }} onPress={() => setPicking(false)}>
          <View style={{ backgroundColor: c.surfaceRaised, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: insets.bottom + 16, gap: 4 }}>
            <Txt variant="h2" style={{ marginBottom: 8 }}>
              Chat status
            </Txt>
            {SET_STATUSES.map((k) => (
              <Pressable
                key={k}
                accessibilityRole="button"
                onPress={() => {
                  setPicking(false);
                  if (k !== ch!.status) setStatus.mutate(k);
                }}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12, backgroundColor: pressed ? c.surfaceSunk : "transparent" })}
              >
                <View style={{ flex: 1 }}>
                  <Txt variant="body" style={{ fontFamily: "DMSans_500Medium" }}>
                    {statusOf(k).label}
                  </Txt>
                  <Txt variant="small" color="inkMuted">
                    {statusOf(k).hint}
                  </Txt>
                </View>
                {k === ch!.status ? <Icon icon={Check} color="brand" /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ m }: { m: LfMessage }) {
  const meta = m.meta ?? {};
  if (meta.reaction) {
    return (
      <Txt variant="small" color="inkMuted" style={{ alignSelf: "flex-start", paddingHorizontal: 8 }}>
        Lingo reacted {meta.reaction} to their message
      </Txt>
    );
  }
  const who = m.role === "c" ? null : m.role === "s" ? "You" : "Lingo";
  const tick = m.role !== "c" && m.status ? (m.status === "read" ? "✓✓ read" : m.status === "delivered" ? "✓✓" : m.status === "failed" ? "not sent" : "✓") : null;
  const kind = m.kind === "voice" ? "🎤 voice note" : m.kind === "image" ? "📷 photo" : null;
  return (
    <Bubble
      side={m.role === "c" ? "in" : "out"}
      tone={m.role === "c" ? "customer" : m.role === "s" ? "seller" : "lingo"}
      image={meta.image ?? null}
      text={m.content}
      buttons={meta.buttons?.map((title) => ({ title }))}
      list={meta.list ? { button: meta.list, rows: (meta.rows ?? []).map((title) => ({ title })) } : undefined}
      meta={
        <Txt variant="small" color="inkMuted">
          {[who && `${who}${m.route === "followup" ? " · follow-up" : ""}`, !who && kind, when(m.created_at), tick].filter(Boolean).join(" · ")}
        </Txt>
      }
    />
  );
}

function Orders({ orders }: { orders: LfOrder[] }) {
  return (
    <View style={{ gap: 8, marginBottom: 8 }}>
      {orders.map((o) => (
        <Card key={o.id} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Txt variant="h3" style={{ flex: 1 }}>
              {`${o.product_name ?? "Order"} × ${o.qty}`}
            </Txt>
            <Badge tone={o.status === "cancelled" ? "neutral" : o.exported_at ? "success" : "brand"}>{o.status === "cancelled" ? "Cancelled" : o.exported_at ? "Sent to Feeder" : "New order"}</Badge>
          </View>
          <Txt>{lkr(o.total)}</Txt>
          <Txt variant="small" color="inkMuted">
            {[o.name, o.address, o.phone1].filter(Boolean).join(" · ")}
          </Txt>
        </Card>
      ))}
    </View>
  );
}
