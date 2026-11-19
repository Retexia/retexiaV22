import "server-only";

import { feederDb } from "../db";
import { gateway } from "./gateway";
import type { AccountRow, LaunchRow } from "./types";

/** feeder.retexia.com (links in WhatsApp messages). */
export const feederUrl = () => (process.env.FEEDER_PANEL_URL || "https://feeder.retexia.com").replace(/\/+$/, "");
export const launchLink = (ref: string) => `${feederUrl()}/autopublish/launches/${encodeURIComponent(ref)}`;

/** One line on the launch's timeline (and the audit trail). */
export async function logEvent(e: { userId: string; ref: string | null; type: string; message: string; actor?: "system" | "customer" | "approver" | "admin" | "rule"; detail?: Record<string, unknown>; nodeId?: string | null }) {
  const { error } = await feederDb()
    .from("ad_events")
    .insert({ user_id: e.userId, launch_ref: e.ref, node_id: e.nodeId ?? null, type: e.type.slice(0, 60), actor: e.actor ?? "system", message: e.message.slice(0, 600), detail: e.detail ?? {} });
  if (error) console.error("[autopublish] event:", error.message);
}

const digits = (n: string) => {
  let d = n.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = `94${d.slice(1)}`;
  else if (d.length === 9) d = `94${d}`;
  return d;
};

/** WhatsApp through the gateway (Evolution). Never throws; returns how many were sent. */
export async function whatsapp(numbers: string[], text: string) {
  let sent = 0;
  for (const n of [...new Set(numbers.map(digits).filter((x) => /^\d{9,15}$/.test(x)))].slice(0, 5)) {
    const r = await gateway({ action: "whatsapp", to: n, text: text.slice(0, 1500) }, 30_000);
    if (r.ok) sent++;
    else console.error("[autopublish] whatsapp:", r.status, JSON.stringify(r.body).slice(0, 200));
  }
  return sent;
}

/**
 * SW-Notify: WhatsApp to the account's notify numbers (approvals go to the
 * approvers). At most one message per launch per 10 minutes, except approvals.
 */
export async function notifyLaunch(launch: Pick<LaunchRow, "ref" | "last_notified_at" | "product_name">, account: Pick<AccountRow, "notify_whatsapp" | "approver_whatsapp">, kind: "approval" | "reminder" | "update", text: string) {
  const to = kind === "update" ? account.notify_whatsapp : account.approver_whatsapp.length ? account.approver_whatsapp : account.notify_whatsapp;
  if (!to.length) return 0;
  if (kind === "update" && launch.last_notified_at && Date.now() - new Date(launch.last_notified_at).getTime() < 10 * 60_000) return 0;
  const sent = await whatsapp(to, `${text}\n\n${launchLink(launch.ref)}`);
  if (sent) await feederDb().from("ad_launches").update({ last_notified_at: new Date().toISOString() }).eq("ref", launch.ref);
  return sent;
}
