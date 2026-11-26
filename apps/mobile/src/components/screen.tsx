import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";

/** A scrolling page on the sunk background with pull-to-refresh (brand-coloured spinner). */
export function Screen({
  children, onRefresh, refreshing = false, contentStyle, bottomInset = true,
}: { children: ReactNode; onRefresh?: () => void; refreshing?: boolean; contentStyle?: StyleProp<ViewStyle>; bottomInset?: boolean }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surfaceSunk }}
      contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: (bottomInset ? insets.bottom : 0) + 24 }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} colors={[c.brand]} progressBackgroundColor={c.surfaceRaised} /> : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

/** Pull-to-refresh for lists (FlatList refreshControl), brand-coloured. */
export function useRefreshControl(refreshing: boolean, onRefresh: () => void) {
  const { c } = useTheme();
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} colors={[c.brand]} progressBackgroundColor={c.surfaceRaised} />;
}

export function Gap({ size = 8 }: { size?: number }) {
  return <View style={{ height: size }} />;
}
