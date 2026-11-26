import type { LfChatItem } from "@retexia/shared/app-api";
import { STATUS_ORDER, isPaused, showPhone, statusOf, timeAgo } from "@retexia/shared/lingo-feeder";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MessageCircle, PauseCircle, PhoneCall, PhoneOff, PlayCircle, Search } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { useRefreshControl } from "@/components/screen";
import { Alert, Badge, Chip, EmptyState, Icon, Input, SkeletonCard, Txt } from "@/components/ui";
import { keys, lfApi, useAction, useLfChats } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

/** Chats, newest first: status chips with counts, search, swipe for Called / Pause Lingo. */
export default function Chats() {
  const params = useLocalSearchParams<{ status?: string }>();
  // A link (Home, a notification) opens a new Chats screen with its status.
  const [status, setStatus] = useState(params.status ?? "all");
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim().slice(0, 60)), 350);
    return () => clearTimeout(t);
  }, [typed]);
  const { c } = useTheme();
  const list = useLfChats(status, q);
  const refreshControl = useRefreshControl(list.isRefetching, () => void list.refetch());
  const counts = list.data?.counts ?? {};
  const chips = [{ key: "all", label: "All" }, ...STATUS_ORDER.map((k) => ({ key: k, label: (k === "call" ? "📞 " : "") + statusOf(k).short }))];

  return (
    <View style={{ flex: 1, backgroundColor: c.surfaceSunk }}>
      <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.line, paddingVertical: 10, gap: 10 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {chips.map((k) => (
            <Chip key={k.key} label={k.label} count={Number(counts[k.key] ?? 0)} active={status === k.key} tone={k.key === "call" ? "danger" : undefined} onPress={() => setStatus(k.key)} />
          ))}
        </ScrollView>
        <View style={{ paddingHorizontal: 16 }}>
          <View style={{ position: "absolute", left: 28, top: 14, zIndex: 1 }}>
            <Icon icon={Search} size={18} />
          </View>
          <Input value={typed} onChangeText={setTyped} placeholder="Search a name or phone number" accessibilityLabel="Search chats" style={{ paddingLeft: 40, minHeight: 44 }} returnKeyType="search" />
        </View>
      </View>
      <FlatList
        data={list.data?.chats ?? []}
        keyExtractor={(i) => i.phone}
        renderItem={({ item }) => <ChatRow item={item} />}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={list.error && !list.data ? <View style={{ padding: 16 }}><Alert tone="danger" title="Couldn't load chats">{list.error.message}</Alert></View> : undefined}
        ListEmptyComponent={
          list.isPending ? (
            <View style={{ padding: 16, gap: 12 }}>
              <SkeletonCard lines={1} />
              <SkeletonCard lines={1} />
            </View>
          ) : (
            <EmptyState icon={MessageCircle} title={q ? "No chats match" : "No chats here"} text={status === "call" ? "Nobody is waiting for a call." : "Chats from your ads show here."} />
          )
        }
      />
    </View>
  );
}

function ChatRow({ item }: { item: LfChatItem }) {
  const router = useRouter();
  const { c } = useTheme();
  const st = statusOf(item.status);
  const paused = isPaused(item.paused_until);
  const invalidate = [keys.lf];
  const called = useAction((v: boolean) => lfApi.chat(item.phone, "called", { called: v }), { invalidate });
  const pause = useAction((v: boolean) => lfApi.chat(item.phone, "pause", { paused: v }), { invalidate });
  const name = item.name || showPhone(item.phone);
  const action = (label: string, icon: typeof PhoneOff, bg: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ width: 96, backgroundColor: bg, alignItems: "center", justifyContent: "center", gap: 4 }}>
      <Icon icon={icon} color={c.onBrand} />
      <Txt variant="small" style={{ color: c.onBrand, fontFamily: "DMSans_500Medium" }}>
        {label}
      </Txt>
    </Pressable>
  );
  return (
    <Swipeable
      friction={2}
      rightThreshold={40}
      leftThreshold={40}
      renderRightActions={item.needs_call ? (_p, _t, m) => action("Called", PhoneOff, c.success, () => { m.close(); called.mutate(true); }) : undefined}
      renderLeftActions={(_p, _t, m) =>
        paused
          ? action("Let Lingo answer", PlayCircle, c.brand, () => { m.close(); pause.mutate(false); })
          : action("Pause Lingo", PauseCircle, c.warning, () => { m.close(); pause.mutate(true); })
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Chat with ${name}`}
        onPress={() => router.push({ pathname: "/lingo-feeder/chats/[phone]", params: { phone: item.phone } })}
        style={({ pressed }) => ({ flexDirection: "row", gap: 12, padding: 16, backgroundColor: pressed ? c.surfaceSunk : c.surfaceRaised, borderBottomWidth: 1, borderBottomColor: c.line })}
      >
        <View style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: item.needs_call ? c.dangerSoft : c.brandSoft, alignItems: "center", justifyContent: "center" }}>
          {item.needs_call ? (
            <Icon icon={PhoneCall} color="danger" />
          ) : (
            <Txt variant="h3" color="brand">
              {(item.name || "?").trim().charAt(0).toUpperCase()}
            </Txt>
          )}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Txt variant="h3" style={{ flex: 1 }} numberOfLines={1}>
              {name}
            </Txt>
            <Txt variant="small" color="inkMuted">
              {timeAgo(item.last_msg_at)}
            </Txt>
          </View>
          {item.last ? (
            <Txt color="inkMuted" numberOfLines={1}>
              {(item.last.role === "c" ? "" : item.last.role === "s" ? "You: " : "Lingo: ") + item.last.content}
            </Txt>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {item.needs_call ? <Badge tone="danger">📞 Call them</Badge> : null}
            <Badge tone={st.tone}>{st.short}</Badge>
            {paused ? <Badge tone="warning">Lingo paused</Badge> : null}
            {item.product ? <Badge>{item.product}</Badge> : null}
          </View>
        </View>
      </Pressable>
    </Swipeable>
  );
}
