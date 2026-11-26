import * as LocalAuthentication from "expo-local-authentication";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import { prefs } from "./prefs";

/**
 * Optional fingerprint / face lock (Account → Lock the app). When on, the app asks on start and
 * after it was in the background for more than a minute. Nothing leaves the phone.
 */
type Lock = {
  available: boolean;
  enabled: boolean;
  locked: boolean;
  setEnabled: (on: boolean) => Promise<boolean>;
  unlock: () => Promise<boolean>;
};
const LockContext = createContext<Lock | null>(null);
const AWAY_MS = 60_000;

export function LockProvider({ children }: { children: ReactNode }) {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabledState] = useState(false);
  const [locked, setLocked] = useState(false);
  const leftAt = useRef<number | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    void (async () => {
      const ok = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
      setAvailable(ok);
      const on = ok && (await prefs.get("lock")) === "on";
      setEnabledState(on);
      setLocked(on);
    })();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background") leftAt.current = Date.now();
      if (s === "active" && enabled && leftAt.current && Date.now() - leftAt.current > AWAY_MS) setLocked(true);
    });
    return () => sub.remove();
  }, [enabled]);

  const unlock = useCallback(async () => {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock Retexia", cancelLabel: "Cancel" });
    if (r.success) setLocked(false);
    return r.success;
  }, []);

  const setEnabled = useCallback(async (on: boolean) => {
    // Turning it on or off needs the fingerprint / face once, so someone else can't change it.
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: on ? "Lock Retexia with your fingerprint or face" : "Turn off the app lock" });
    if (!r.success) return false;
    setEnabledState(on);
    await prefs.set("lock", on ? "on" : "off");
    return true;
  }, []);

  const value = useMemo(() => ({ available, enabled, locked, setEnabled, unlock }), [available, enabled, locked, setEnabled, unlock]);
  return <LockContext.Provider value={value}>{children}</LockContext.Provider>;
}

export function useLock() {
  const l = useContext(LockContext);
  if (!l) throw new Error("useLock outside LockProvider");
  return l;
}
