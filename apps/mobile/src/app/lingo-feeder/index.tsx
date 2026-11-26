import { lkr, timeAgo } from "@retexia/shared/lingo-feeder";
import { useRouter } from "expo-router";
import { FlaskConical, MessageCircleMore, PackageCheck, PhoneCall } from "lucide-react-native";
import { Switch, View } from "react-native";
import { PushPrompt } from "@/components/push-prompt";
import { Screen } from "@/components/screen";
import { Alert, Badge, Card, Divider, Row, Section, SkeletonCard, Stat, Txt } from "@/components/ui";
import { keys, lfApi, useAction, useLfHome } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

/** Lingo Feeder home: Lingo on/off, the WhatsApp number, today and this month, shortcuts. */
export default function LfHome() {
  const router = useRouter();
  const { c } = useTheme();
  const home = useLfHome();
  const toggle = useAction((on: boolean) => lfApi.lingo(on), { invalidate: [keys.lfHome] });
  const d = home.data;
  const s = d?.stats;
  const on = d?.seller?.status === "live";
  const n = d?.number;
  return (
    <Screen onRefresh={() => void home.refetch()} refreshing={home.isRefetching}>
      {home.isPending ? <SkeletonCard lines={3} /> : null}
      {home.error && !d ? <Alert tone="danger" title="Couldn't load Lingo Feeder">{home.error.message}</Alert> : null}
      {d ? (
        <>
          {d.seller?.status === "blocked" ? (
            <Alert tone="danger" title="Lingo is on hold">Lingo is on hold for your account. Please contact Retexia.</Alert>
          ) : (
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="h2">{on ? "Lingo is answering" : "Lingo is off"}</Txt>
                  <Txt color="inkMuted">{on ? "She answers new messages on your WhatsApp." : "New messages wait in Chats for you."}</Txt>
                </View>
                <Switch
                  accessibilityLabel="Lingo on or off"
                  value={on}
                  disabled={toggle.isPending}
                  onValueChange={(v) => toggle.mutate(v)}
                  trackColor={{ true: c.success, false: c.lineStrong }}
                  thumbColor="#ffffff"
                />
              </View>
              {d.seller?.status === "setup" ? (
                <Txt variant="small" color="inkMuted">
                  Finish setup on feeder.retexia.com → Lingo Feeder: your business details and WhatsApp number.
                </Txt>
              ) : null}
            </Card>
          )}

          {n ? (
            n.status === "problem" ? (
              <Alert tone="danger" title="Your WhatsApp number has a problem">
                {n.problem ?? "Lingo can't answer on it right now. Check it on feeder.retexia.com → Lingo Feeder → WhatsApp."}
              </Alert>
            ) : (
              <Card>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Txt variant="h3">WhatsApp</Txt>
                  <Badge tone={n.status === "connected" ? "success" : "warning"}>{n.status === "connected" ? "Connected" : n.status === "pending" ? "Not tested yet" : "Off"}</Badge>
                </View>
                <Txt>{[n.verified_name, n.display_phone].filter(Boolean).join(" · ") || "Your number"}</Txt>
                <Txt variant="small" color="inkMuted">
                  {`Last message ${timeAgo(n.last_webhook_at)}${n.quality_rating ? ` · quality ${n.quality_rating.toLowerCase()}` : ""}`}
                </Txt>
              </Card>
            )
          ) : (
            <Alert tone="warning" title="No WhatsApp number yet">Connect your number on feeder.retexia.com → Lingo Feeder → WhatsApp.</Alert>
          )}

          {s ? (
            <>
              <Section title="Today">
                <Card>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <Stat label="Chats" value={s.chats_today.toLocaleString("en-US")} />
                    <Stat label="Orders" value={s.orders_today.toLocaleString("en-US")} />
                    <Stat label="Sales" value={lkr(s.sales_today)} wide />
                  </View>
                </Card>
              </Section>
              <Section title="This month">
                <Card>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <Stat label="Chats" value={s.chats_month.toLocaleString("en-US")} />
                    <Stat label="Orders" value={s.orders_month.toLocaleString("en-US")} />
                    <Stat label="Sales" value={lkr(s.sales_month)} wide />
                  </View>
                </Card>
              </Section>
              <Card padded={false} style={{ paddingHorizontal: 16, gap: 0 }}>
                <Row
                  icon={PhoneCall}
                  iconColor={s.call ? "danger" : "inkMuted"}
                  title="Call them"
                  right={s.call ? <Badge tone="danger">{String(s.call)}</Badge> : undefined}
                  onPress={() => router.push("/lingo-feeder/chats?status=call")}
                />
                <Divider />
                <Row icon={MessageCircleMore} title="Chats" onPress={() => router.push("/lingo-feeder/chats")} />
                <Divider />
                <Row
                  icon={PackageCheck}
                  title="Orders"
                  subtitle={s.to_export ? `${s.to_export} new for the courier file` : undefined}
                  right={s.to_export ? <Badge tone="brand">{String(s.to_export)}</Badge> : undefined}
                  onPress={() => router.push("/lingo-feeder/orders")}
                />
                <Divider />
                <Row icon={FlaskConical} title="Try Lingo" subtitle="Chat with her as a customer" onPress={() => router.push("/lingo-feeder/try")} />
              </Card>
            </>
          ) : null}
          <PushPrompt reason="Know at once when a customer asks for a call or confirms an order." />
          <Txt variant="small" color="inkMuted" style={{ paddingHorizontal: 4 }}>
            Products, business details and the WhatsApp connection are set on feeder.retexia.com.
          </Txt>
        </>
      ) : null}
    </Screen>
  );
}
