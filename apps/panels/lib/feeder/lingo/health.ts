import "server-only";

import type { ProductItem } from "./data";

export type Issue = { level: "danger" | "warning"; text: string };

/** Prices written in a description ("රු. 1,340", "Rs 1340", "1340/-"). */
function writtenPrices(text: string) {
  const out = new Set<number>();
  for (const m of text.matchAll(/(?:rs\.?|lkr|රු\.?|රුපියල්)\s*([\d,]{3,})|([\d,]{3,})\s*(?:\/-|rs\b|රු)/gi)) {
    const n = Number(String(m[1] ?? m[2]).replace(/,/g, ""));
    if (Number.isFinite(n) && n >= 100) out.add(n);
  }
  return [...out];
}

/** Is the photo a public image WhatsApp can fetch? (HEAD, 4 s) */
export async function imageOk(url: string | null) {
  if (!url) return false;
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(4000), cache: "no-store", redirect: "follow" });
    return res.ok && /^image\//.test(res.headers.get("content-type") ?? "image/");
  } catch {
    return false;
  }
}

/** Product health checks for the seller (what makes Lingo's answers wrong or weak). */
export function productIssues(p: ProductItem, photoOk: boolean): Issue[] {
  const list: Issue[] = [];
  if (!p.image_url) list.push({ level: "danger", text: "No photo: Lingo sends only text for this product." });
  else if (!photoOk) list.push({ level: "danger", text: "The photo link doesn't open publicly, so WhatsApp can't send it." });
  if (!p.long_description) list.push({ level: "danger", text: "No long description (the first message customers get)." });
  else if (Array.from(p.long_description).length > 1024) list.push({ level: "warning", text: `The description is ${Array.from(p.long_description).length} characters; WhatsApp captions stop at 1,024, so it goes as a separate message.` });
  const prices = writtenPrices(p.long_description + " " + p.short_info);
  const ok = new Set([p.price, p.delivery_fee, p.price + p.delivery_fee].map(Number));
  const wrong = prices.filter((n) => !ok.has(n));
  if (wrong.length) list.push({ level: "danger", text: `The description says ${wrong.map((n) => n.toLocaleString("en-US")).join(", ")}, but the price is ${p.price.toLocaleString("en-US")}. Use {price} in the text so it's always right.` });
  const junk = p.aliases.split(",").map((a) => a.trim()).filter((a) => a && (/\d/.test(a) || /\b(copy|link|http|www)\b/i.test(a)));
  if (junk.length) list.push({ level: "warning", text: `Aliases that look like ad or link labels: ${junk.slice(0, 3).join(", ")}${junk.length > 3 ? "…" : ""}.` });
  if (!p.usage && !p.precautions) list.push({ level: "warning", text: "No usage or precautions: Lingo can't answer \"how to use\" or \"is it safe\" questions." });
  if (!p.faqs) list.push({ level: "warning", text: "No FAQs yet." });
  if (!p.ads) list.push({ level: "warning", text: "No ad points to this product yet." });
  return list;
}
