import { Fingerprint } from "lucide-react-native";
import { useEffect } from "react";
import { View } from "react-native";
import { useAuth } from "@/lib/auth";
import { useLock } from "@/lib/lock";
import { useTheme } from "@/lib/theme";
import { Mark } from "./mark";
import { Button, Txt } from "./ui";

/** Covers the app while the biometric lock is on and not yet unlocked. */
export function LockScreen() {
  const { locked, unlock } = useLock();
  const { session } = useAuth();
  const { c } = useTheme();
  const show = locked && Boolean(session);
  useEffect(() => {
    if (show) void unlock();
  }, [show, unlock]);
  if (!show) return null;
  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", gap: 16, padding: 24, zIndex: 100 }}>
      <Mark size={56} color={c.surface === "#ffffff" ? undefined : "#ffffff"} />
      <Txt style={{ fontFamily: "Outfit_300Light", fontSize: 36, lineHeight: 44, color: c.ink }}>Retexia</Txt>
      <Txt color="inkMuted">Locked</Txt>
      <Button title="Unlock" icon={Fingerprint} onPress={() => void unlock()} />
    </View>
  );
}
