import { Stack, useLocalSearchParams } from "expo-router";
import { MonitorSmartphone } from "lucide-react-native";
import { Screen } from "@/components/screen";
import { Badge, Card, EmptyState, Txt } from "@/components/ui";
import { PANEL_HOST } from "@/lib/config";
import { useMe } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

/** A product (or Feeder package) that has no screens in the app yet. */
export default function ProductScreen() {
  const { key, pkg } = useLocalSearchParams<{ key: string; pkg?: string }>();
  const { product } = useTheme();
  const me = useMe();
  const p = me.data?.products.find((x) => x.key === key);
  const k = pkg ? p?.packages.find((x) => x.slug === pkg) : undefined;
  const title = k?.name ?? p?.shortName ?? "";
  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      {p ? (
        <Card>
          <Badge product={product(p.key, p.colors)}>{p.shortName}</Badge>
          <Txt variant="h2">{k?.name ?? p.name}</Txt>
        </Card>
      ) : null}
      <EmptyState
        icon={MonitorSmartphone}
        title="Coming to the app"
        text={`${title || "This"} doesn't have screens in the app yet. Use it on ${PANEL_HOST[key] ?? "retexia.com"} for now, signed in with the same account.`}
      />
    </Screen>
  );
}
