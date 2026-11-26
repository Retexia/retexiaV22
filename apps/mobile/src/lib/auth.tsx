import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { config } from "./config";
import { unregisterPush } from "./push";
import { clearCache } from "./query";
import { supabase } from "./supabase";

/**
 * Sign-in with the same Retexia accounts as retexia.com: email + password, or an email link
 * (no new accounts from the app). The session lives in the phone's secure store.
 */
type Auth = {
  ready: boolean;
  session: Session | null;
  signInWithPassword: (email: string, password: string) => Promise<string | null>;
  sendLink: (email: string) => Promise<string | null>;
  finishLink: (p: { token_hash?: string; type?: string; code?: string }) => Promise<string | null>;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<Auth | null>(null);

function message(e: { code?: string; message?: string; status?: number }) {
  switch (e.code) {
    case "invalid_credentials":
      return "That email or password doesn't match. Try again or reset your password.";
    case "email_not_confirmed":
      return "Please confirm your email first. Check your inbox for our link.";
    case "otp_disabled":
    case "user_not_found":
      return "There's no Retexia account with that email.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Please wait a minute and try again.";
    case "otp_expired":
      return "That link has expired. Ask for a new one.";
    case "user_banned":
      return "This account is on hold. Please contact Retexia.";
    default:
      return e.status === 0 || /network|fetch/i.test(e.message ?? "") ? "No connection. Check your internet and try again." : "Something went wrong. Please try again.";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) void clearCache();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<Auth>(
    () => ({
      ready,
      session,
      async signInWithPassword(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        return error ? message(error) : null;
      },
      async sendLink(email) {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim().toLowerCase(),
          // The email template appends &token_hash=…&type=email to this address; Android opens it in
          // the app (App Links), or retexia.com/app-auth shows an "Open the app" button.
          options: { shouldCreateUser: false, emailRedirectTo: `${config.webUrl}/app-auth?next=%2F` },
        });
        return error ? message(error) : null;
      },
      async finishLink({ token_hash, type, code }) {
        if (token_hash) {
          const otpType = type === "magiclink" || type === "signup" || type === "invite" || type === "recovery" ? type : "email";
          const { error } = await supabase.auth.verifyOtp({ token_hash, type: otpType });
          return error ? message(error) : null;
        }
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          return error ? message(error) : null;
        }
        return "That link isn't complete. Ask for a new one.";
      },
      async signOut() {
        await unregisterPush().catch(() => undefined);
        await supabase.auth.signOut({ scope: "local" });
        await clearCache();
      },
    }),
    [ready, session],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const a = useContext(AuthContext);
  if (!a) throw new Error("useAuth outside AuthProvider");
  return a;
}
