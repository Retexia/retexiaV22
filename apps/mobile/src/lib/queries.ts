import type {
  AppMe, InboxItem, LfChats, LfHome, LfOrders, LfThread, LfTryReply, NotificationPrefs,
} from "@retexia/shared/app-api";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { toast } from "sonner-native";
import { api, ApiError } from "./api";

/** Query keys and hooks for every /api/app answer. */
export const keys = {
  me: ["me"] as const,
  inbox: ["inbox"] as const,
  prefs: ["prefs"] as const,
  lf: ["lf"] as const,
  lfHome: ["lf", "home"] as const,
  lfChats: (status: string, q: string) => ["lf", "chats", status, q] as const,
  lfThread: (phone: string) => ["lf", "thread", phone] as const,
  lfOrders: (view: string) => ["lf", "orders", view] as const,
};

export const useMe = (enabled = true) => useQuery({ queryKey: keys.me, queryFn: () => api<AppMe>("/me"), enabled });
export const useInbox = () => useQuery({ queryKey: keys.inbox, queryFn: () => api<{ items: InboxItem[] }>("/inbox") });
export const usePrefs = () => useQuery({ queryKey: keys.prefs, queryFn: () => api<NotificationPrefs>("/notifications") });

export const useLfHome = (enabled = true) => useQuery({ queryKey: keys.lfHome, queryFn: () => api<LfHome>("/lingo-feeder/home"), enabled });
export const useLfChats = (status: string, q: string) =>
  useQuery({
    queryKey: keys.lfChats(status, q),
    queryFn: () => api<LfChats>(`/lingo-feeder/chats?status=${encodeURIComponent(status)}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
    placeholderData: (prev) => prev,
  });
export const useLfThread = (phone: string) =>
  useQuery({ queryKey: keys.lfThread(phone), queryFn: () => api<LfThread>(`/lingo-feeder/chats/${encodeURIComponent(phone)}`) });
export const useLfOrders = (view: string) =>
  useQuery({ queryKey: keys.lfOrders(view), queryFn: () => api<LfOrders>(`/lingo-feeder/orders?view=${view}`), placeholderData: (prev) => prev });

type Result = { message: string | null; data?: unknown };

/**
 * A change on the server: toast its message, a haptic tap, then refresh what it touched.
 * Errors show as a toast with the server's words.
 */
export function useAction<I = void, R extends Result = Result>(
  fn: (input: I) => Promise<R>,
  opts: { invalidate?: QueryKey[]; haptic?: boolean; silent?: boolean; onDone?: (r: R, input: I) => void } = {},
) {
  const qc = useQueryClient();
  return useMutation<R, ApiError, I>({
    mutationFn: fn,
    onSuccess: async (r, input) => {
      if (opts.haptic !== false) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (r?.message && !opts.silent) toast.success(r.message);
      opts.onDone?.(r, input);
      await Promise.all((opts.invalidate ?? []).map((k) => qc.invalidateQueries({ queryKey: k })));
    },
    onError: (e) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.error(e.message);
    },
  });
}

/** Lingo Feeder is on the account (the server's access rule, from /api/app/me). */
export const hasLingoFeeder = (me: AppMe | undefined) => Boolean(me?.products.some((p) => p.packages.some((k) => k.slug === "lingo-feeder" && k.open)));

export const lfApi = {
  chat: (phone: string, action: "reply" | "status" | "called" | "pause", body: Record<string, unknown>) =>
    api<Result>(`/lingo-feeder/chats/${encodeURIComponent(phone)}/${action}`, { method: "POST", body }),
  order: (id: number, action: "cancel" | "restore" | "sent" | "unsent") => api<Result>(`/lingo-feeder/orders/${id}/${action}`, { method: "POST" }),
  lingo: (on: boolean) => api<Result>("/lingo-feeder/lingo", { method: "POST", body: { on } }),
  try: (body: { text?: string; tap?: { id: string; title: string } | null; name?: string }) =>
    api<{ message: string | null; data?: LfTryReply }>("/lingo-feeder/try", { method: "POST", body }),
  resetTry: () => api<Result>("/lingo-feeder/try", { method: "DELETE" }),
};
