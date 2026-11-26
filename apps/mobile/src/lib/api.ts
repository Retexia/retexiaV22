import { File, Paths } from "expo-file-system";
import { config } from "./config";
import { supabase } from "./supabase";

/** An answer from /api/app that wasn't OK: `message` is written for people. */
export class ApiError extends Error {
  constructor(message: string, public status: number, public fieldErrors?: Record<string, string>) {
    super(message);
  }
}

async function token(forceRefresh = false) {
  if (forceRefresh) {
    const { data } = await supabase.auth.refreshSession();
    return data.session?.access_token ?? null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function send(path: string, init: { method?: string; body?: unknown }, retry = true): Promise<Response> {
  const t = await token();
  if (!t) throw new ApiError("Please sign in again.", 401);
  let res: Response;
  try {
    res = await fetch(config.apiUrl + path, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${t}`,
        accept: "application/json",
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError("No connection. Check your internet and try again.", 0);
  }
  if (res.status === 401 && retry) {
    // The access token may have just expired: refresh once, then give up (sign-in again).
    if (await token(true)) return send(path, init, false);
    await supabase.auth.signOut({ scope: "local" });
  }
  return res;
}

const NOT_READY = "Retexia's server didn't answer as expected. Please try again in a few minutes.";

/** Call /api/app/<path> as the signed-in person. Throws ApiError with a message for people. */
export async function api<T>(path: string, init: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown } = {}): Promise<T> {
  const res = await send(`/api/app${path}`, init);
  // Every /api/app answer is JSON. Anything else (a web page, a login redirect) means the server
  // isn't the app's API: say so instead of showing empty screens.
  if (!(res.headers.get("content-type") ?? "").includes("application/json")) {
    throw new ApiError(NOT_READY, res.status >= 400 ? res.status : 502);
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string; fieldErrors?: Record<string, string> }) | null;
  if (!res.ok) throw new ApiError(data?.error ?? `Something went wrong (${res.status}). Please try again.`, res.status, data?.fieldErrors);
  if (data == null) throw new ApiError(NOT_READY, 502);
  return data as T;
}

/** Download a file from /api/app (e.g. the courier CSV) into the app's cache. */
export async function apiFile(path: string, fallbackName: string): Promise<{ file: File; count: number }> {
  const res = await send(`/api/app${path}`, {});
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(data?.error ?? `Something went wrong (${res.status}).`, res.status);
  }
  if (!(res.headers.get("content-type") ?? "").includes("text/csv")) throw new ApiError(NOT_READY, 502);
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName;
  let text = await res.text();
  // Keep the UTF-8 BOM the courier format needs (some fetch implementations drop it).
  if (!text.startsWith("﻿")) text = "﻿" + text;
  const file = new File(Paths.cache, name.replace(/[^\w().-]+/g, "_"));
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  return { file, count: Number(res.headers.get("x-lingo-orders") ?? 0) };
}
