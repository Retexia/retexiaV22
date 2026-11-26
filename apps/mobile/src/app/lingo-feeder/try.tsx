import { statusOf } from "@retexia/shared/lingo-feeder";
import { Stack } from "expo-router";
import { RotateCcw, SendHorizontal } from "lucide-react-native";
import { useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { BodyBubble, Bubble, Note } from "@/components/chat";
import { Badge, IconButton, Input, Txt } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { lfApi } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

/** Try Lingo: chat with her as a customer. The real engine answers; nothing goes to WhatsApp. */
type Item =
  | { kind: "customer"; text: string }
  | { kind: "lingo"; body: Record<string, unknown>; last: boolean; call?: string | null }
  | { kind: "note"; text: string };

export default function TryLingo() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("Hello! Can I get more info on this?");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const list = useRef<FlatList<Item>>(null);

  const send = async (input: { text?: string; tap?: { id: string; title: string } }) => {
    setBusy(true);
    setItems((x) => [...x.map((i) => (i.kind === "lingo" ? { ...i, last: false } : i)), { kind: "customer", text: input.tap ? input.tap.title : input.text! }]);
    try {
      const r = await lfApi.try(input);
      const d = r.data;
      if (!d) throw new ApiError("Lingo didn't answer.", 500);
      if (d.status) setStatus(d.status);
      if (d.stopped) setItems((x) => [...x, { kind: "note", text: d.stopped === "paused" ? "Lingo stepped back in this chat (a person should answer). Start a new test chat." : `No reply (${d.stopped}).` }]);
      else if (!d.messages?.length) setItems((x) => [...x, { kind: "note", text: "Lingo didn't need to answer that." }]);
      else setItems((x) => [...x, ...d.messages!.map((m, i, all) => ({ kind: "lingo" as const, body: m.body, last: true, call: i === all.length - 1 && d.needs_call ? (d.call_reason ?? "Call them") : null }))]);
    } catch (e) {
      setItems((x) => [...x, { kind: "note", text: e instanceof Error ? e.message : "Something went wrong." }]);
    } finally {
      setBusy(false);
      setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.surfaceSunk }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              icon={RotateCcw}
              label="New test chat"
              onPress={() =>
                void lfApi.resetTry().then(
                  () => {
                    setItems([]);
                    setStatus(null);
                    toast.success("New test chat.");
                  },
                  (e: Error) => toast.error(e.message),
                )
              }
            />
          ),
        }}
      />
      {status ? (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", padding: 10, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <Txt variant="small" color="inkMuted">
            This chat:
          </Txt>
          <Badge tone={statusOf(status).tone}>{statusOf(status).label}</Badge>
        </View>
      ) : null}
      <FlatList
        ref={list}
        data={items}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: 12, gap: 10, flexGrow: 1 }}
        ListEmptyComponent={
          <Txt color="inkMuted" style={{ textAlign: "center", margin: "auto", maxWidth: 300 }}>
            Chat as a customer who tapped your ad. Lingo answers exactly as on WhatsApp: tap her buttons, write in Sinhala, Singlish or English. No order goes to Feeder.
          </Txt>
        }
        renderItem={({ item }) =>
          item.kind === "customer" ? (
            <Bubble side="in" tone="customer" text={item.text} />
          ) : item.kind === "note" ? (
            <Note>{item.text}</Note>
          ) : (
            <BodyBubble
              body={item.body}
              onTap={item.last && !busy ? (t) => void send({ tap: t }) : undefined}
              meta={item.call ? <Txt variant="small" color="danger">📞 {item.call}</Txt> : undefined}
            />
          )
        }
      />
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 10, paddingBottom: insets.bottom + 10, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line }}>
        <Input value={text} onChangeText={setText} placeholder="Message as the customer" multiline maxLength={1500} style={{ flex: 1, maxHeight: 120 }} accessibilityLabel="Message as the customer" />
        <IconButton
          icon={SendHorizontal}
          label="Send"
          tone="brand"
          disabled={busy || !text.trim()}
          onPress={() => {
            const t = text.trim();
            setText("");
            void send({ text: t });
          }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
