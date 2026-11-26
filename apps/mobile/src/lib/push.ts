import type { useRouter } from "expo-router";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./api";
import { prefs } from "./prefs";

/**
 * Push notifications: the server queues them (migration 0044) and admin's dispatcher sends them
 * through Expo. Here: Android channels, asking for permission at a useful moment (never on first
 * launch), registering this phone's token for the signed-in person, and opening the right screen
 * when a notification is tapped (data.url is an app path such as /lingo-feeder/chats?status=call).
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Android channels (people can mute each in system settings). Must exist before asking on Android 13+. */
export async function ensureChannels() {
  if (Platform.OS !== "android") return;
  await Promise.all([
    Notifications.setNotificationChannelAsync("default", { name: "Updates", importance: AndroidImportance.DEFAULT }),
    Notifications.setNotificationChannelAsync("calls", {
      name: "Call them", description: "A customer is waiting for your call", importance: AndroidImportance.MAX,
      vibrationPattern: [0, 250, 150, 250], lightColor: "#b42318",
    }),
    Notifications.setNotificationChannelAsync("orders", {
      name: "New orders", description: "A customer confirmed an order", importance: AndroidImportance.HIGH, lightColor: "#2a68d9",
    }),
  ]);
}

export type PushState = "granted" | "denied" | "undetermined" | "unavailable";

export async function pushState(): Promise<PushState> {
  if (!Device.isDevice || Platform.OS === "web") return "unavailable";
  const p = await Notifications.getPermissionsAsync();
  return p.granted ? "granted" : p.canAskAgain ? "undetermined" : "denied";
}

const projectId = () => (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;

/**
 * Register this phone for the signed-in person. With ask = true the system prompt is shown if
 * needed (call it from a button the person pressed). Returns the permission state.
 */
export async function registerPush(ask = false): Promise<PushState> {
  let state = await pushState();
  if (state === "unavailable") return state;
  await ensureChannels();
  if (state === "undetermined" && ask) {
    const r = await Notifications.requestPermissionsAsync();
    state = r.granted ? "granted" : r.canAskAgain ? "undetermined" : "denied";
  }
  if (state !== "granted") return state;
  const id = projectId();
  if (!id) {
    console.warn("[push] No EAS project id (run `eas init`): this build can't get a push token.");
    return state;
  }
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  await api("/push-token", {
    method: "POST",
    body: { token, platform: Platform.OS === "ios" ? "ios" : "android", device: Device.modelName ?? null, version: Constants.expoConfig?.version ?? null },
  });
  await prefs.set("push-token", token);
  return state;
}

/** Sign-out: this phone stops getting the person's notifications. */
export async function unregisterPush() {
  const token = await prefs.get("push-token");
  if (!token) return;
  await api("/push-token", { method: "DELETE", body: { token } }).catch(() => undefined);
  await prefs.remove("push-token");
}

/** Open the screen a notification points to (only app paths; anything else opens the Inbox). */
export function openFromNotification(router: ReturnType<typeof useRouter>, data: unknown) {
  const url = (data as { url?: unknown } | null)?.url;
  const path = typeof url === "string" && /^\/[\w\-/?=&%.]*$/.test(url) ? url : "/inbox";
  router.push(path as never);
}
