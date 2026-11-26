import { DMMono_400Regular } from "@expo-google-fonts/dm-mono/400Regular";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_600SemiBold } from "@expo-google-fonts/dm-sans/600SemiBold";
import { NotoSansSinhala_400Regular } from "@expo-google-fonts/noto-sans-sinhala/400Regular";
import { NotoSansSinhala_500Medium } from "@expo-google-fonts/noto-sans-sinhala/500Medium";
import { Outfit_300Light } from "@expo-google-fonts/outfit/300Light";
import { Outfit_400Regular } from "@expo-google-fonts/outfit/400Regular";
import { Outfit_500Medium } from "@expo-google-fonts/outfit/500Medium";
import { useQueryClient } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Toaster } from "sonner-native";
import { LockScreen } from "@/components/lock-screen";
import { ProgressLine } from "@/components/loader";
import { Txt } from "@/components/ui";
import { AuthProvider, useAuth } from "@/lib/auth";
import { configured } from "@/lib/config";
import { LockProvider } from "@/lib/lock";
import { openFromNotification, registerPush } from "@/lib/push";
import { keys, useMe } from "@/lib/queries";
import { QueryProvider } from "@/lib/query";
import { supabase } from "@/lib/supabase";
import { ThemeProvider, typeStyle, useTheme } from "@/lib/theme";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fonts] = useFonts({
    Outfit_300Light, Outfit_400Regular, Outfit_500Medium,
    DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold,
    DMMono_400Regular, NotoSansSinhala_400Regular, NotoSansSinhala_500Medium,
  });
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <LockProvider>{fonts ? <App /> : null}</LockProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function App() {
  const { c, scheme } = useTheme();
  const { ready, session } = useAuth();
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;
  if (!configured) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: c.surface }}>
        <Txt variant="h2">This build isn&apos;t set up</Txt>
        <Txt color="inkMuted" style={{ textAlign: "center" }}>
          EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are missing (apps/mobile/.env.example).
        </Txt>
      </View>
    );
  }
  const signedIn = Boolean(session);
  const nav = scheme === "dark" ? DarkTheme : DefaultTheme;
  return (
    <NavThemeProvider value={{ ...nav, colors: { ...nav.colors, background: c.surfaceSunk, card: c.surface, text: c.ink, border: c.line, primary: c.brand, notification: c.danger } }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.surface },
          headerTintColor: c.ink,
          headerTitleStyle: { ...typeStyle("h2"), color: c.ink } as never,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: c.surfaceSunk },
        }}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="lingo-feeder" options={{ headerShown: false }} />
          <Stack.Screen name="product/[key]" options={{ title: "" }} />
          <Stack.Screen name="account/notifications" options={{ title: "Notifications" }} />
          <Stack.Screen name="account/delete" options={{ title: "Delete my account" }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Screen name="app-auth" options={{ headerShown: false }} />
      </Stack>
      {signedIn ? <SignedIn /> : null}
      <ProgressLine />
      <Toaster position="top-center" richColors={false} toastOptions={{ style: { backgroundColor: c.surfaceRaised, borderColor: c.line, borderWidth: 1 }, titleStyle: { ...typeStyle("body"), color: c.ink } }} />
      <LockScreen />
    </NavThemeProvider>
  );
}

/** Things that run while someone is signed in: push registration and routing, live Lingo Feeder updates. */
function SignedIn() {
  const qc = useQueryClient();
  const me = useMe();
  const lf = Boolean(me.data?.products.some((p) => p.packages.some((k) => k.slug === "lingo-feeder" && k.open)));

  // Keep this phone registered (only if notifications are already allowed: asking happens on a button).
  useEffect(() => {
    void registerPush(false).catch(() => undefined);
  }, []);

  // Live chats: Supabase Realtime on the seller's own rows (RLS), refreshing what changed.
  const uid = me.data?.user.id;
  useEffect(() => {
    if (!lf || !uid) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void qc.invalidateQueries({ queryKey: keys.lf }), 400);
    };
    const channel = supabase
      .channel(`lf-${uid}`)
      .on("postgres_changes", { event: "*", schema: "lingo_feeder", table: "messages", filter: `user_id=eq.${uid}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "lingo_feeder", table: "chats", filter: `user_id=eq.${uid}` }, refresh)
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [lf, uid, qc]);
  // Notifications exist only on phones (not in the web preview).
  return Platform.OS === "web" ? null : <PushRouting />;
}

/** A tapped notification opens its screen (also when it started the app); one that arrives refreshes data. */
function PushRouting() {
  const router = useRouter();
  const qc = useQueryClient();
  const last = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!last || handled.current === last.notification.request.identifier) return;
    handled.current = last.notification.request.identifier;
    openFromNotification(router, last.notification.request.content.data);
    void qc.invalidateQueries({ queryKey: keys.me });
  }, [last, router, qc]);
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => {
      void qc.invalidateQueries({ queryKey: keys.me });
      void qc.invalidateQueries({ queryKey: keys.inbox });
      void qc.invalidateQueries({ queryKey: keys.lf });
    });
    return () => sub.remove();
  }, [qc]);
  return null;
}
