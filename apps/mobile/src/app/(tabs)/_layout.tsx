import { Tabs } from "expo-router/js-tabs";
import { Bell, CircleUserRound, House, LayoutGrid, type LucideIcon } from "lucide-react-native";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Wordmark } from "@/components/wordmark";
import { useMe } from "@/lib/queries";
import { typeStyle, useTheme } from "@/lib/theme";

const icon = (I: LucideIcon) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <I color={String(color)} size={22} strokeWidth={1.5} />;
  };

export default function TabsLayout() {
  const { c } = useTheme();
  const me = useMe();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.surface, borderBottomColor: c.line, borderBottomWidth: 1, elevation: 0, shadowOpacity: 0 },
        headerTitleStyle: { ...typeStyle("h2"), color: c.ink },
        headerTitleAlign: "left",
        tabBarActiveTintColor: c.brand,
        tabBarInactiveTintColor: c.inkMuted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line, height: 66 + insets.bottom, paddingTop: 4, paddingBottom: insets.bottom + 6 },
        tabBarLabelStyle: { fontFamily: "DMSans_500Medium", fontSize: 11, lineHeight: 14 },
        tabBarBadgeStyle: { backgroundColor: c.danger, color: c.onDanger, fontFamily: "DMSans_600SemiBold", fontSize: 10 },
        sceneStyle: { backgroundColor: c.surfaceSunk },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", headerTitle: () => <Wordmark />, tabBarIcon: icon(House) }} />
      <Tabs.Screen name="inbox" options={{ title: "Inbox", tabBarIcon: icon(Bell), tabBarBadge: me.data?.unread ? Math.min(me.data.unread, 99) : undefined }} />
      <Tabs.Screen name="products" options={{ title: "Products", tabBarIcon: icon(LayoutGrid) }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: icon(CircleUserRound) }} />
    </Tabs>
  );
}
