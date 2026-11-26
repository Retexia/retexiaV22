import { BellRing } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { toast } from "sonner-native";
import { prefs } from "@/lib/prefs";
import { pushState, registerPush } from "@/lib/push";
import { Button, Card, Icon, Txt } from "./ui";

/**
 * Asks for notification permission at a useful moment (Android 13+ shows a system prompt), never
 * on first launch: a card the person can accept or dismiss.
 */
export function PushPrompt({ reason }: { reason: string }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void Promise.all([pushState(), prefs.get("push-prompt")]).then(([s, d]) => setShow(s === "undetermined" && d !== "dismissed"));
  }, []);
  if (!show) return null;
  return (
    <Card>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        <Icon icon={BellRing} color="brand" />
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="h3">Turn on notifications</Txt>
          <Txt variant="body" color="inkMuted">
            {reason}
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          title="Turn on"
          size="sm"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            const s = await registerPush(true).catch(() => "denied" as const);
            setBusy(false);
            setShow(false);
            if (s === "granted") toast.success("Notifications are on.");
            else toast("You can turn them on later in Account → Notifications.");
          }}
        />
        <Button
          title="Not now"
          size="sm"
          variant="ghost"
          onPress={() => {
            setShow(false);
            void prefs.set("push-prompt", "dismissed");
          }}
        />
      </View>
    </Card>
  );
}
