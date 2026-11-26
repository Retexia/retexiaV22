import type { AppPackage, AppProduct } from "@retexia/shared/app-api";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { Screen } from "@/components/screen";
import { Alert, Badge, Button, Card, Divider, Row, SkeletonCard, Txt } from "@/components/ui";
import { useMe } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

/**
 * Every Retexia product and what's on the account. The app sells nothing: a product or package
 * that isn't on the account says so, with no price and no link.
 */
const statusWords = (s: string | null, trialEndsAt: string | null) => {
  if (s === "trial" && trialEndsAt) return `Free trial until ${new Date(trialEndsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Colombo" })}`;
  if (s === "setting_up") return "Being set up";
  if (s === "paused") return "Paused";
  if (s === "free") return "Free";
  return "On your account";
};

export default function Products() {
  const router = useRouter();
  const { product } = useTheme();
  const me = useMe();
  const open = (p: AppProduct, k?: AppPackage) => {
    if (k?.slug === "lingo-feeder") router.push("/lingo-feeder");
    else router.push({ pathname: "/product/[key]", params: { key: p.key, ...(k ? { pkg: k.slug } : {}) } });
  };
  return (
    <Screen onRefresh={() => void me.refetch()} refreshing={me.isRefetching}>
      {me.isPending ? <SkeletonCard lines={4} /> : null}
      {me.error && !me.data ? (
        <Alert tone="danger" title="Couldn't load your products" action={<Button title="Try again" size="sm" variant="secondary" onPress={() => void me.refetch()} />}>
          {me.error.message}
        </Alert>
      ) : null}
      {(me.data?.products ?? []).map((p) => {
        const colors = product(p.key, p.colors);
        return (
          <Card key={p.key} padded={false} style={{ gap: 0 }}>
            <View style={{ padding: 16, gap: 6 }}>
              <Badge product={colors}>{p.shortName}</Badge>
              <Txt variant="h2">{p.name}</Txt>
              {!p.packages.length ? (
                <Txt color={p.open ? "inkMuted" : "lineStrong"}>{p.open ? statusWords(p.status, p.trialEndsAt) : "This isn't on your account"}</Txt>
              ) : null}
            </View>
            {p.packages.length ? (
              <View style={{ paddingHorizontal: 16 }}>
                {p.packages.map((k) => (
                  <View key={k.slug}>
                    <Divider />
                    <Row
                      title={k.name}
                      subtitle={k.open ? statusWords(k.status, k.trialEndsAt) : "This isn't on your account"}
                      onPress={k.open ? () => open(p, k) : undefined}
                      chevron={k.open}
                    />
                  </View>
                ))}
              </View>
            ) : p.open ? (
              <View style={{ paddingHorizontal: 16 }}>
                <Divider />
                <Row title="Open" onPress={() => open(p)} />
              </View>
            ) : null}
          </Card>
        );
      })}
      {me.data ? (
        <Txt variant="small" color="inkMuted" style={{ textAlign: "center", paddingHorizontal: 16 }}>
          Billing is managed on retexia.com.
        </Txt>
      ) : null}
    </Screen>
  );
}
