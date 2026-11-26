import { Stack } from "expo-router";
import { Lock } from "lucide-react-native";
import { View } from "react-native";
import { RetexiaLoader } from "@/components/loader";
import { Alert, Button, EmptyState } from "@/components/ui";
import { hasLingoFeeder, useMe } from "@/lib/queries";
import { typeStyle, useTheme } from "@/lib/theme";

/** Lingo Feeder: only when it's on the account (the server checks every call too). */
export default function LingoFeederLayout() {
  const { c } = useTheme();
  const me = useMe();
  if (!me.data) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surfaceSunk, justifyContent: "center", padding: 16 }}>
        {me.error ? (
          <Alert tone="danger" title="Couldn't load Lingo Feeder" action={<Button title="Try again" size="sm" variant="secondary" onPress={() => void me.refetch()} />}>
            {me.error.message}
          </Alert>
        ) : (
          <RetexiaLoader />
        )}
      </View>
    );
  }
  if (!hasLingoFeeder(me.data)) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surfaceSunk, justifyContent: "center" }}>
        <EmptyState icon={Lock} title="Lingo Feeder" text="This isn't on your account." />
      </View>
    );
  }
  return (
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
      <Stack.Screen name="index" options={{ title: "Lingo Feeder" }} />
      <Stack.Screen name="chats/index" options={{ title: "Chats" }} />
      <Stack.Screen name="chats/[phone]" options={{ title: "" }} />
      <Stack.Screen name="orders" options={{ title: "Orders" }} />
      <Stack.Screen name="try" options={{ title: "Try Lingo" }} />
    </Stack>
  );
}
