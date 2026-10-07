import "server-only";

import { adminUrl, webUrl } from "./env";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Branded HTML for a notification (same look as the Supabase auth emails). */
export function notificationHtml(opts: { heading: string; body: string; button?: { label: string; href: string } }) {
  const paragraphs = esc(opts.body)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#5a6884;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  const button = opts.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;"><tr><td align="center" bgcolor="#2a68d9" style="border-radius:999px;"><a href="${esc(opts.button.href)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(opts.button.label)}</a></td></tr></table>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f7fc;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f7fc;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
<tr><td style="padding:0 8px 20px 8px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1;color:#2a68d9;">Retexia</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e4ebf5;border-radius:20px;padding:36px 32px;">
<h1 style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;font-weight:600;color:#16264a;">${esc(opts.heading)}</h1>
${paragraphs}${button}
</td></tr>
<tr><td style="padding:20px 8px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#7d8dab;">Retexia · Simple tools for busy businesses · <a href="https://retexia.com" style="color:#7d8dab;">retexia.com</a><br>Questions? Just reply to this email.</td></tr>
</table></td></tr></table></body></html>`;
}

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY);

/** Send one email through Resend. */
export async function sendEmail(input: { to: string; subject: string; html: string; text: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "Retexia <admin@retexia.com>",
        reply_to: process.env.EMAIL_REPLY_TO || undefined,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    return res.ok && json.id ? { ok: true, id: json.id } : { ok: false, error: json.message ?? `Resend replied ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach Resend" };
  }
}

/** Where the email's button points: the customer's order page, or the admin for team emails. */
export function notificationLink(payload: Record<string, unknown>, audience: "customer" | "staff") {
  const ref = typeof payload.ref === "string" ? payload.ref : null;
  if (audience === "staff") return ref ? { label: "Open in admin", href: `${adminUrl()}/requests/${encodeURIComponent(ref)}` } : { label: "Open admin", href: adminUrl() };
  return ref ? { label: "View your request", href: `${webUrl()}/account/products/${encodeURIComponent(ref)}` } : { label: "Open my account", href: `${webUrl()}/account` };
}
