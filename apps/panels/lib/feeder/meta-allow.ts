/**
 * Which Meta calls Retexia makes for a seller: the same allow-list as the n8n gateway's
 * Config node (n8n/feeder-autopublish.json). Pure, so a test checks both agree.
 */
export type MetaCall = {
  action: string;
  method?: string;
  path?: string;
  page_id?: string;
  params?: Record<string, unknown>;
  account?: string;
  image_url?: string;
};

const META_GET = [/^$/, /^search$/, /^act_\d+$/, /^act_\d+\/(campaigns|adsets|ads|adcreatives|advideos|adimages|insights)$/, /^\d+$/, /^\d+\/(thumbnails|ads|insights)$/];
const META_POST = [/^act_\d+\/(campaigns|adsets|adcreatives|ads|advideos)$/, /^\d+$/];
const STORAGE_LINK = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/sign\/autopublish\//;

/** null = allowed, else why not. */
export function metaAllowed(call: MetaCall): string | null {
  const path = String(call.path ?? "").replace(/^\/+/, "");
  if (call.action === "meta") {
    if (!(call.method === "GET" ? META_GET : META_POST).some((re) => re.test(path))) return `Meta ${call.method} ${path} is not allowed`;
    if (call.method === "GET" && path === "" && !call.params?.ids) return "Meta: ids needed";
    if (call.method === "POST" && /^\d+$/.test(path) && !Object.keys(call.params ?? {}).every((k) => ["status", "creative"].includes(k))) return "Meta: only status / creative changes on an object";
    return null;
  }
  if (call.action === "meta_page") {
    const pid = String(call.page_id ?? "");
    const p = call.params ?? {};
    if (!/^\d{5,25}$/.test(pid)) return "Page call not allowed";
    const ok =
      path === `${pid}/leadgen_forms` ||
      (call.method === "GET" && (path === `${pid}/posts` || path === `${pid}/ads_posts` || path === pid || /^\d+_\d+\/comments$/.test(path))) ||
      (call.method === "POST" && /^\d+_\d+\/comments$/.test(path) && Object.keys(p).every((k) => k === "message")) ||
      (call.method === "POST" && /^\d+_\d+$/.test(path) && Object.keys(p).length === 1 && Object.hasOwn(p, "is_hidden")) ||
      (call.method === "POST" && path === `${pid}/messages` && Boolean(p.recipient) && typeof p.recipient === "object" &&
        Object.keys(p.recipient as object).join() === "comment_id" && Object.keys(p).every((k) => ["recipient", "message"].includes(k)));
    return ok ? null : `Page ${call.method} ${path} is not allowed`;
  }
  if (call.action === "meta_image") {
    return /^act_\d{5,25}$/.test(call.account ?? "") && STORAGE_LINK.test(call.image_url ?? "") ? null : "image upload not allowed";
  }
  return "not a Meta call";
}

