import Constants from "expo-constants";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Bell, FileText, Fingerprint, KeyRound, LogOut, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Alert as RNAlert, View } from "react-native";
import { toast } from "sonner-native";
import { Screen } from "@/components/screen";
import { Alert, Badge, Button, Card, Divider, Icon, Row, Section, Segmented, SkeletonCard, SwitchRow, Txt } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { config } from "@/lib/config";
import { useLock } from "@/lib/lock";
import { useMe } from "@/lib/queries";
import { useTheme, type ThemeMode } from "@/lib/theme";

/** Profile, notifications, appearance, the app lock, sign-out and account deletion. No billing here. */
export default function Account() {
  const router = useRouter();
  const { mode, setMode } = useTheme();
  const { signOut } = useAuth();
  const lock = useLock();
  const me = useMe();
  const [leaving, setLeaving] = useState(false);
  const u = me.data?.user;
  return (
    <Screen onRefresh={() => void me.refetch()} refreshing={me.isRefetching}>
      {u ? (
        <Card>
          <Txt variant="h2">{u.name || u.email}</Txt>
          <Txt color="inkMuted">{[u.business, u.email, u.phone].filter(Boolean).join(" · ")}</Txt>
          {me.data?.deletionRequestedAt ? <Badge tone="danger">Deletion requested</Badge> : null}
        </Card>
      ) : me.error ? (
        <Alert tone="danger" title="Couldn't load your account" action={<Button title="Try again" size="sm" variant="secondary" onPress={() => void me.refetch()} />}>
          {me.error.message}
        </Alert>
      ) : (
        <SkeletonCard lines={1} />
      )}

      <Section title="This app">
        <Card padded={false} style={{ paddingHorizontal: 16, gap: 0 }}>
          <Row icon={Bell} title="Notifications" subtitle="Call them, new orders, product news" onPress={() => router.push("/account/notifications")} />
          {lock.available ? (
            <>
              <Divider />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Icon icon={Fingerprint} />
                <View style={{ flex: 1 }}>
                  <SwitchRow
                    title="Lock with fingerprint or face"
                    subtitle="Asks when you open the app"
                    value={lock.enabled}
                    onChange={(on) => void lock.setEnabled(on).then((ok) => ok && toast.success(on ? "The app is locked with your fingerprint or face." : "App lock is off."))}
                  />
                </View>
              </View>
            </>
          ) : null}
          <Divider />
          <View style={{ paddingVertical: 12, gap: 8 }}>
            <Txt variant="body" style={{ fontFamily: "DMSans_500Medium" }}>
              Appearance
            </Txt>
            <Segmented<ThemeMode>
              value={mode}
              onChange={setMode}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "system", label: "Phone" },
              ]}
            />
          </View>
        </Card>
      </Section>

      <Section title="Account">
        <Card padded={false} style={{ paddingHorizontal: 16, gap: 0 }}>
          <Row icon={KeyRound} title="Password and email" subtitle="Change them on retexia.com" onPress={() => void WebBrowser.openBrowserAsync(`${config.webUrl}/account/security`)} />
          <Divider />
          <Row icon={FileText} title="Privacy policy" onPress={() => void WebBrowser.openBrowserAsync(`${config.webUrl}/privacy`)} />
          <Divider />
          <Row
            icon={LogOut}
            title="Sign out"
            chevron={false}
            onPress={() =>
              RNAlert.alert("Sign out?", "You'll need your email and password (or an email link) to sign in again. This phone stops getting notifications.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Sign out",
                  style: "destructive",
                  onPress: () => {
                    setLeaving(true);
                    void signOut().finally(() => setLeaving(false));
                  },
                },
              ])
            }
          />
          <Divider />
          <Row icon={Trash2} title="Delete my account" danger onPress={() => router.push("/account/delete")} />
        </Card>
      </Section>

      <Txt variant="small" color="inkMuted" style={{ textAlign: "center" }}>
        {leaving ? "Signing out…" : `Billing is managed on retexia.com · Retexia ${Constants.expoConfig?.version ?? ""}`}
      </Txt>
    </Screen>
  );
}
