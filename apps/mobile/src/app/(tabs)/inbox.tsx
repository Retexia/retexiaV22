import type { InboxItem } from "@retexia/shared/app-api";
import { timeAgo } from "@retexia/shared/lingo-feeder";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { Bell } from "lucide-react-native";
import { useCallback } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useRefreshControl } from "@/components/screen";
import { Alert, EmptyState, SkeletonCard, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { openFromNotification } from "@/lib/push";
import { keys, useInbox } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

/** Every app notification, newest first. Opening the Inbox marks them read. */
export default function Inbox() {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const inbox = useInbox();
  const refreshControl = useRefreshControl(inbox.isRefetching, () => void inbox.refetch());
  useFocusEffect(
    useCallback(() => {
      void inbox.refetch().then(() => api("/inbox", { method: "POST" }).then(() => qc.invalidateQueries({ queryKey: keys.me })).catch(() => undefined));
      // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit
    }, []),
  );
  const renderItem = ({ item }: { item: InboxItem }) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => openFromNotification(router, item)}
      style={({ pressed }) => ({ flexDirection: "row", gap: 12, padding: 16, backgroundColor: pressed ? c.surfaceSunk : c.surfaceRaised, borderBottomWidth: 1, borderBottomColor: c.line })}
    >
      <View style={{ width: 8, paddingTop: 7 }}>{item.unread ? <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: c.brand }} /> : null}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Txt variant="h3" style={{ flex: 1 }} numberOfLines={1}>
            {item.title}
          </Txt>
          <Txt variant="small" color="inkMuted">
            {timeAgo(item.at)}
          </Txt>
        </View>
        <Txt color="inkMuted" numberOfLines={3}>
          {item.body}
        </Txt>
      </View>
    </Pressable>
  );
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: c.surfaceSunk }}
      data={inbox.data?.items ?? []}
      keyExtractor={(i) => i.id}
      renderItem={renderItem}
      refreshControl={refreshControl}
      ListHeaderComponent={inbox.error && !inbox.data ? <View style={{ padding: 16 }}><Alert tone="danger" title="Couldn't load notifications">{inbox.error.message}</Alert></View> : undefined}
      ListEmptyComponent={
        inbox.isPending ? (
          <View style={{ padding: 16 }}>
            <SkeletonCard lines={2} />
          </View>
        ) : (
          <EmptyState icon={Bell} title="No notifications yet" text="Calls to make, new orders and news about your products show here." />
        )
      }
    />
  );
}
