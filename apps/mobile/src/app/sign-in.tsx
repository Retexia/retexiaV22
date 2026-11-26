import * as WebBrowser from "expo-web-browser";
import { Mail } from "lucide-react-native";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Wordmark } from "@/components/wordmark";
import { Alert, Button, Field, Input, Segmented, Txt, type InputRef } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { config } from "@/lib/config";
import { useTheme } from "@/lib/theme";

/**
 * Sign in with an existing Retexia account (made on retexia.com). Email + password, or a sign-in
 * link by email. The app has no sign-up and nothing to buy.
 */
export default function SignIn() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { signInWithPassword, sendLink } = useAuth();
  const [mode, setMode] = useState<"password" | "link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const passwordRef = useRef<InputRef>(null);
  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  const submit = async () => {
    setError(null);
    if (!validEmail) return setError("Enter the email you use for Retexia.");
    if (mode === "password" && !password) return setError("Enter your password.");
    setBusy(true);
    const err = mode === "password" ? await signInWithPassword(email, password) : await sendLink(email);
    setBusy(false);
    if (err) return setError(err);
    if (mode === "link") setSent(email.trim().toLowerCase());
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, gap: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 12 }}>
          <Wordmark />
          <Txt variant="display">Sign in</Txt>
          <Txt variant="body-lg" color="inkMuted">
            Use the email of your Retexia account.
          </Txt>
        </View>

        {sent ? (
          <Alert tone="success" title="Check your email" action={<Button title="Use another email" variant="secondary" size="sm" onPress={() => setSent(null)} />}>
            {`We sent a sign-in link to ${sent}. Open it on this phone and the app signs you in.`}
          </Alert>
        ) : (
          <View style={{ gap: 16 }}>
            <Segmented
              value={mode}
              onChange={(m) => {
                setMode(m);
                setError(null);
              }}
              options={[
                { value: "password", label: "Password" },
                { value: "link", label: "Email me a link" },
              ]}
            />
            <Field label="Email">
              <Input
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="username"
                returnKeyType={mode === "password" ? "next" : "send"}
                onSubmitEditing={() => (mode === "password" ? passwordRef.current?.focus() : void submit())}
                accessibilityLabel="Email"
              />
            </Field>
            {mode === "password" ? (
              <Field label="Password">
                <Input
                  ref={passwordRef}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="current-password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={() => void submit()}
                  accessibilityLabel="Password"
                />
              </Field>
            ) : null}
            {error ? (
              <Txt variant="body" color="danger" accessibilityLiveRegion="polite">
                {error}
              </Txt>
            ) : null}
            <Button title={mode === "password" ? "Sign in" : "Send the link"} icon={mode === "link" ? Mail : undefined} loading={busy} onPress={() => void submit()} full />
            {mode === "password" ? (
              <Button title="Forgot your password?" variant="ghost" onPress={() => void WebBrowser.openBrowserAsync(`${config.webUrl}/forgot-password`)} />
            ) : null}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
