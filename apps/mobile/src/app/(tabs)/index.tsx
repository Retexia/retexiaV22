import { lkr } from "@retexia/shared/lingo-feeder";
import { useRouter } from "expo-router";
import { ChevronRight, MessageCircleMore, PackageCheck, PhoneCall, TriangleAlert } from "lucide-react-native";
import { View } from "react-native";
import { PushPrompt } from "@/components/push-prompt";
import { Screen } from "@/components/screen";
import { Alert, Badge, Button, Card, Divider, EmptyState, Row, SkeletonCard, Stat, Txt } from "@/components/ui";
import { hasLingoFeeder, useLfHome, useMe } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

const greeting = () => {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Colombo" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

/** Home: what's on the account today, "Call them" first. */
export default function Home() {
  const router = useRouter();
  const { c, product } = useTheme();
  const me = useMe();
  const lfOpen = hasLingoFeeder(me.data);
  const lf = useLfHome(lfOpen);
  const name = me.data?.user.name.split(/\s+/)[0];
  const others = (me.data?.products ?? []).filter((p) => p.open && p.key !== "plan" && !(p.key === "feeder" && lfOpen && p.packages.filter((k) => k.open).every((k) => k.inApp)));
  const feeder = me.data?.products.find((p) => p.key === "feeder");
  const s = lf.data?.stats;

  return (
    <Screen onRefresh={() => void Promise.all([me.refetch(), lfOpen ? lf.refetch() : null])} refreshing={me.isRefetching || lf.isRefetching}>
      <View style={{ gap: 4, paddingHorizontal: 4 }}>
        <Txt variant="h1">{name ? `${greeting()}, ${name}` : greeting()}</Txt>
        <Txt color="inkMuted">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Colombo" })}</Txt>
      </View>

      {me.isPending ? <SkeletonCard /> : null}
      {me.error && !me.data ? (
        <Alert tone="danger" title="Couldn't load your account" action={<Button title="Try again" size="sm" variant="secondary" onPress={() => void me.refetch()} />}>
          {me.error.message}
        </Alert>
      ) : null}

      {lfOpen ? (
        <>
          {lf.data?.number?.status === "problem" ? (
            <Alert tone="danger" title="Your WhatsApp number has a problem">
              {lf.data.number.problem ?? "Lingo can't answer on it right now. Check it on feeder.retexia.com → Lingo Feeder → WhatsApp."}
            </Alert>
          ) : null}
          <Card onPress={() => router.push("/lingo-feeder")}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ gap: 4 }}>
                <Badge product={product("feeder", feeder?.colors)}>Lingo Feeder</Badge>
                <Txt variant="h2">{lf.data?.seller?.business_name ?? "Your WhatsApp assistant"}</Txt>
              </View>
              <ChevronRight size={20} strokeWidth={1.5} color={c.lineStrong} />
            </View>
            {s ? (
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Stat label="Chats today" value={s.chats_today.toLocaleString("en-US")} />
                <Stat label="Orders" value={s.orders_today.toLocaleString("en-US")} />
                <Stat label="Sales" value={lkr(s.sales_today)} wide />
              </View>
            ) : lf.isPending ? (
              <Txt color="inkMuted">Loading today&apos;s numbers…</Txt>
            ) : null}
            {lf.error && !lf.data ? <Txt color="danger">{lf.error.message}</Txt> : null}
          </Card>

          {s ? (
            <Card padded={false} style={{ paddingHorizontal: 16, gap: 0 }}>
              <Row
                icon={PhoneCall}
                iconColor={s.call ? "danger" : "inkMuted"}
                title="Call them"
                subtitle={s.call ? "Customers waiting for your call" : "Nobody is waiting for a call"}
                right={s.call ? <Badge tone="danger">{String(s.call)}</Badge> : undefined}
                onPress={() => router.push("/lingo-feeder/chats?status=call")}
              />
              <Divider />
              <Row
                icon={PackageCheck}
                iconColor={s.to_export ? "brand" : "inkMuted"}
                title="New orders"
                subtitle={s.to_export ? "Confirmed, not in a courier file yet" : "No new orders to send"}
                right={s.to_export ? <Badge tone="brand">{String(s.to_export)}</Badge> : undefined}
                onPress={() => router.push("/lingo-feeder/orders")}
              />
              <Divider />
              <Row icon={MessageCircleMore} title="Chats" subtitle={`${s.chats_month.toLocaleString("en-US")} this month`} onPress={() => router.push("/lingo-feeder/chats")} />
            </Card>
          ) : null}
          <PushPrompt reason="Know at once when a customer asks for a call or confirms an order." />
        </>
      ) : null}

      {others.map((p) => (
        <Card key={p.key} onPress={() => router.push({ pathname: "/product/[key]", params: { key: p.key } })}>
          <Badge product={product(p.key, p.colors)}>{p.shortName}</Badge>
          <Txt variant="h2">{p.name}</Txt>
          <Txt color="inkMuted">{p.status === "setting_up" ? "We're setting it up for you." : "On your account."}</Txt>
        </Card>
      ))}

      {me.data && !lfOpen && !others.length ? (
        <EmptyState icon={TriangleAlert} title="Nothing to open in the app yet" text="Your Retexia products show here once they're on your account." />
      ) : null}
    </Screen>
  );
}
