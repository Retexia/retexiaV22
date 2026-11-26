import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { RetexiaLoader } from "@/components/loader";
import { Alert, Button } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

/**
 * The email sign-in link comes back here: https://retexia.com/app-auth?…&token_hash=…&type=email
 * (Android App Link) or retexia://app-auth?… (the "Open the app" button on that web page).
 */
export default function AppAuth() {
  const { c } = useTheme();
  const router = useRouter();
  const { finishLink } = useAuth();
  const p = useLocalSearchParams<{ token_hash?: string; type?: string; code?: string }>();
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void finishLink({ token_hash: p.token_hash, type: p.type, code: p.code }).then((err) => {
      if (err) setError(err);
      else router.replace("/");
    });
  }, [finishLink, p.token_hash, p.type, p.code, router]);
  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: c.surface }}>
      {error ? (
        <Alert tone="danger" title="Couldn't sign you in" action={<Button title="Back to sign in" onPress={() => router.replace("/sign-in")} />}>
          {error}
        </Alert>
      ) : (
        <RetexiaLoader label="Signing you in" />
      )}
    </View>
  );
}
