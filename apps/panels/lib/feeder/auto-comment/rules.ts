/**
 * Auto comment: what to do with one comment (pure, used by the live checker
 * and by the "Try a comment" box in the panel, so both always agree).
 */

export type Rule = { words: string[]; reply: string; private?: string };

export type CommentSettings = {
  enabled: boolean;
  /** AI reads each comment and decides (hide / reply / private message); the keyword replies are the backup. */
  ai_on: boolean;
  /** The seller's own words: which comments to hide. */
  hide_rules: string;
  /** The seller's own words: how to reply. */
  reply_style: string;
  reply_on: boolean;
  replies: string[];
  rules: Rule[];
  private_on: boolean;
  private_text: string;
  first_on: boolean;
  first_text: string;
  first_on_ads: boolean;
  first_on_posts: boolean;
  hide_on: boolean;
  hide_phones: boolean;
  hide_links: boolean;
  hide_words: string[];
};

export type Decision = {
  /** Why it is hidden ("phone number", "link", "word: scam"), or null. */
  hide: string | null;
  /** The public reply under the comment, or null. */
  reply: string | null;
  /** The private message (Messenger private reply), or null. */
  private: string | null;
  /** Which rule matched ("price, ganan"), or "default" / null. */
  rule: string | null;
};

export const LIMITS = { replies: 5, rules: 15, words: 20, text: 1000, hideWords: 50, instructions: 1500 } as const;

export const DEFAULT_HIDE_RULES = [
  "Hide comments that:",
  "- are rude, abusive, sexual or insulting",
  "- say the product is fake or a scam just to put others off (no real question)",
  "- advertise another shop, page or product",
  "- are spam or have nothing to do with the post",
  "Don't hide real questions or complaints from customers: answer them politely.",
].join("\n");

export const DEFAULT_REPLY_STYLE = [
  "Short and friendly, like a real shop owner. Thank them by first name.",
  "Use the language the customer used: Sinhala, Singlish or English.",
  "Don't write the price in public: say we sent the details in a message.",
  "In the private message give the price, cash on delivery and how to order.",
].join("\n");

/** Good starting settings for a Feeder reseller (Sinhala, Singlish and English questions). */
export function defaultSettings(): CommentSettings {
  return {
    enabled: false,
    ai_on: true,
    hide_rules: DEFAULT_HIDE_RULES,
    reply_style: DEFAULT_REPLY_STYLE,
    reply_on: true,
    replies: [
      "Thank you {name} 😊 We sent you the details in a message. Please check your inbox.",
      "Hi {name}, thanks for your interest 😊 The details are in your inbox.",
    ],
    rules: [
      {
        words: ["price", "how much", "ganan", "gana", "mila", "kiyada", "keeyada", "මිල", "කීයද", "ගාන"],
        reply: "Hi {name} 😊 We sent you the price and the offer in a message. Please check your inbox.",
        private: "",
      },
      {
        words: ["delivery", "deliver", "cod", "cash on delivery", "gedarata", "ගෙදරට", "ඩිලිවරි"],
        reply: "Yes {name} 😊 Island-wide cash on delivery. We sent you the details in a message.",
        private: "",
      },
      {
        words: ["order", "oder", "ona", "oney", "ewanna", "එවන්න", "ඕනෙ", "ඕන"],
        reply: "Thank you {name} 😊 Please check your inbox, we sent you how to order.",
        private: "",
      },
    ],
    private_on: true,
    private_text: "Hi {name} 😊 Thank you for your comment. Reply here or tap the WhatsApp button on the ad and we'll send you the price and the offer.",
    first_on: false,
    first_text: "📦 To order: tap \"Send message\" or WhatsApp us. Island-wide cash on delivery 🚚",
    first_on_ads: true,
    first_on_posts: false,
    hide_on: true,
    hide_phones: true,
    hide_links: true,
    hide_words: [],
  };
}

const clean = (s: unknown, max: number = LIMITS.text) => (typeof s === "string" ? s.trim().slice(0, max) : "");
const list = (v: unknown, max: number, len = 80) =>
  (Array.isArray(v) ? v : [])
    .map((x) => clean(x, len))
    .filter(Boolean)
    .slice(0, max);

/** A database row (or anything) → settings with every field filled in. */
export function readSettings(row: Partial<Record<keyof CommentSettings, unknown>> | null | undefined): CommentSettings {
  const d = defaultSettings();
  if (!row) return d;
  const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
  const rules = (Array.isArray(row.rules) ? row.rules : d.rules)
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return { words: list(o.words, LIMITS.words), reply: clean(o.reply), private: clean(o.private) };
    })
    .filter((r) => r.words.length && (r.reply || r.private))
    .slice(0, LIMITS.rules);
  return {
    enabled: bool(row.enabled, d.enabled),
    ai_on: bool(row.ai_on, d.ai_on),
    hide_rules: typeof row.hide_rules === "string" ? clean(row.hide_rules, LIMITS.instructions) : d.hide_rules,
    reply_style: typeof row.reply_style === "string" ? clean(row.reply_style, LIMITS.instructions) : d.reply_style,
    reply_on: bool(row.reply_on, d.reply_on),
    replies: Array.isArray(row.replies) ? list(row.replies, LIMITS.replies, LIMITS.text) : d.replies,
    rules,
    private_on: bool(row.private_on, d.private_on),
    private_text: typeof row.private_text === "string" ? clean(row.private_text) : d.private_text,
    first_on: bool(row.first_on, d.first_on),
    first_text: typeof row.first_text === "string" ? clean(row.first_text) : d.first_text,
    first_on_ads: bool(row.first_on_ads, d.first_on_ads),
    first_on_posts: bool(row.first_on_posts, d.first_on_posts),
    hide_on: bool(row.hide_on, d.hide_on),
    hide_phones: bool(row.hide_phones, d.hide_phones),
    hide_links: bool(row.hide_links, d.hide_links),
    hide_words: Array.isArray(row.hide_words) ? list(row.hide_words, LIMITS.hideWords) : d.hide_words,
  };
}

/** Lower case, Sinhala kept, extra spaces gone. */
const norm = (s: string) => s.toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();

/** A word or phrase in the comment: whole words for Latin letters ("one" ≠ "phone"), anywhere for Sinhala. */
export function hasWord(text: string, word: string): boolean {
  const t = norm(text);
  const w = norm(word);
  if (!w) return false;
  if (/^[\p{Script=Latin}\d\s'-]+$/u.test(w)) {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, "u").test(t);
  }
  return t.includes(w);
}

/** A phone number: 9+ digits in a row (spaces, dashes and dots between them allowed), e.g. 077 123 4567, +94771234567. */
export function hasPhone(text: string): boolean {
  const digits = text.match(/\+?\d[\d\s.\-()]{7,}\d/g) ?? [];
  return digits.some((d) => d.replace(/\D/g, "").length >= 9);
}

/** A link: http(s)://, www., wa.me, or a web address like shop.lk/x. */
export function hasLink(text: string): boolean {
  return /(https?:\/\/|www\.|wa\.me\/|bit\.ly\/|\b[a-z0-9-]{2,}\.(com|lk|net|org|info|xyz|link|shop|store|online|site|me|io|co)(\/|\b))/i.test(text);
}

/** The first name to put in {name} ("Nimal Perera" → "Nimal"); empty when Facebook doesn't say. */
export function firstName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first.length > 1 && first.length <= 30 ? first : "";
}

/** {name} → the commenter's first name, or nothing (and the text still reads well). */
export function fill(text: string, name: string | null | undefined): string {
  const n = firstName(name);
  return text
    .replace(/\{name\}/gi, n)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/^\s*,\s*/, "")
    .trim();
}

/** A stable pick, so the same comment always gets the same variant. */
export function pick<T>(items: T[], seed: string): T | undefined {
  if (!items.length) return undefined;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return items[Math.abs(h) % items.length];
}

/**
 * What to do with one comment.
 *   1. Hide (phone number, link, a chosen word): hidden comments get no public reply,
 *      only the private message (so a customer who left their number still hears from you).
 *   2. Otherwise the first keyword rule that matches, else a default reply.
 *   3. The private message: the rule's own one, else the general one.
 */
export function decide(s: CommentSettings, comment: { id?: string; message?: string | null; author?: string | null }): Decision {
  const text = comment.message ?? "";
  const seed = comment.id || text;
  let hide: string | null = null;
  if (s.hide_on) {
    if (s.hide_phones && hasPhone(text)) hide = "phone number";
    else if (s.hide_links && hasLink(text)) hide = "link";
    else {
      const w = s.hide_words.find((x) => hasWord(text, x));
      if (w) hide = `word: ${w}`;
    }
  }

  const rule = text ? s.rules.find((r) => r.words.some((w) => hasWord(text, w))) : undefined;
  let reply: string | null = null;
  if (!hide && s.reply_on) {
    const base = rule?.reply || pick(s.replies, seed) || null;
    reply = base ? fill(base, comment.author) : null;
  }
  const privateBase = s.private_on ? rule?.private || s.private_text : rule?.private || "";
  const priv = privateBase ? fill(privateBase, comment.author) : null;

  return {
    hide,
    reply,
    private: priv,
    rule: rule ? rule.words.slice(0, 3).join(", ") : reply || priv ? "default" : null,
  };
}
