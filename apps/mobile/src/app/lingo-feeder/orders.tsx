import type { LfOrder } from "@retexia/shared/app-api";
import { lkr, showPhone, when } from "@retexia/shared/lingo-feeder";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { PackageCheck, Share2 } from "lucide-react-native";
import { useState } from "react";
import { Alert as RNAlert, FlatList, View } from "react-native";
import { toast } from "sonner-native";
import { useRefreshControl } from "@/components/screen";
import { Alert, Badge, Button, Card, EmptyState, Segmented, SkeletonCard, Txt } from "@/components/ui";
import { apiFile } from "@/lib/api";
import { keys, lfApi, useAction, useLfOrders } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

type View_ = "new" | "sent" | "cancelled" | "all";

/** Orders Lingo took, and the courier file for Feeder Bulk create (shared from the phone). */
export default function Orders() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const [view, setView] = useState<View_>("new");
  const list = useLfOrders(view);
  const refreshControl = useRefreshControl(list.isRefetching, () => void list.refetch());
  const [sharing, setSharing] = useState(false);
  const toExport = list.data?.toExport ?? 0;

  const share = async () => {
    setSharing(true);
    try {
      const { file, count } = await apiFile("/lingo-feeder/orders/courier.csv", "orders.csv");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: "Courier file for Feeder", UTI: "public.comma-separated-values-text" });
      toast.success(`${count} ${count === 1 ? "order is" : "orders are"} in the courier file and marked as sent.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't make the courier file.");
    } finally {
      setSharing(false);
      await qc.invalidateQueries({ queryKey: keys.lf });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surfaceSunk }}>
      <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.line, padding: 12, gap: 10 }}>
        <Segmented<View_>
          value={view}
          onChange={setView}
          options={[
            { value: "new", label: "New" },
            { value: "sent", label: "Sent" },
            { value: "cancelled", label: "Cancelled" },
            { value: "all", label: "All" },
          ]}
        />
        <Button
          title={toExport ? `Share the courier file (${toExport})` : "No new orders for a courier file"}
          icon={Share2}
          disabled={!toExport}
          loading={sharing}
          onPress={() => void share()}
          full
        />
      </View>
      <FlatList
        data={list.data?.orders ?? []}
        keyExtractor={(o) => String(o.id)}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        renderItem={({ item }) => <OrderCard o={item} />}
        refreshControl={refreshControl}
        ListHeaderComponent={list.error && !list.data ? <Alert tone="danger" title="Couldn't load orders">{list.error.message}</Alert> : undefined}
        ListEmptyComponent={
          list.isPending ? (
            <SkeletonCard lines={2} />
          ) : (
            <EmptyState icon={PackageCheck} title={view === "new" ? "No new orders" : "No orders here"} text="Orders customers confirm with Lingo show here." />
          )
        }
      />
    </View>
  );
}

function OrderCard({ o }: { o: LfOrder }) {
  const router = useRouter();
  const invalidate = [keys.lf];
  const act = useAction((a: "cancel" | "restore" | "sent" | "unsent") => lfApi.order(o.id, a), { invalidate });
  const cancelled = o.status === "cancelled";
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Txt variant="h3" style={{ flex: 1 }}>
          {`${o.product_name ?? "Order"} × ${o.qty}`}
        </Txt>
        <Badge tone={cancelled ? "neutral" : o.exported_at ? "success" : "brand"}>{cancelled ? "Cancelled" : o.exported_at ? "Sent" : "New"}</Badge>
      </View>
      <Txt variant="h2">{lkr(o.total)}</Txt>
      <View style={{ gap: 2 }}>
        <Txt style={{ fontFamily: "DMSans_500Medium" }}>{o.name ?? "No name yet"}</Txt>
        {o.address ? <Txt color="inkMuted">{o.address}</Txt> : null}
        <Txt color="inkMuted">{[o.phone1, o.phone2].filter(Boolean).map((p) => showPhone(p!)).join(" · ") || showPhone(o.phone)}</Txt>
        <Txt variant="small" color="inkMuted">
          {when(o.confirmed_at ?? o.created_at)}
        </Txt>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button title="Chat" size="sm" variant="secondary" onPress={() => router.push({ pathname: "/lingo-feeder/chats/[phone]", params: { phone: o.phone } })} />
        {!cancelled ? (
          <Button
            title={o.exported_at ? "Put back in the next file" : "Mark as sent"}
            size="sm"
            variant="secondary"
            loading={act.isPending && (act.variables === "sent" || act.variables === "unsent")}
            onPress={() => act.mutate(o.exported_at ? "unsent" : "sent")}
          />
        ) : null}
        <Button
          title={cancelled ? "Order back on" : "Cancel"}
          size="sm"
          variant="ghost"
          loading={act.isPending && (act.variables === "cancel" || act.variables === "restore")}
          onPress={() =>
            cancelled
              ? act.mutate("restore")
              : RNAlert.alert("Cancel this order?", o.exported_at ? "It's already in a courier file: change it in Feeder too." : "It won't go in the next courier file.", [
                  { text: "Keep it", style: "cancel" },
                  { text: "Cancel order", style: "destructive", onPress: () => act.mutate("cancel") },
                ])
          }
        />
      </View>
    </Card>
  );
}
