import { PageHeader } from "@retexia/ui/admin";
import { RepliesEditor, type ReplyEntry } from "@/components/lingo/replies-editor";
import { REPLY_KEYS } from "@/lib/lingo/labels";
import { requireLingoPage } from "@/lib/lingo/session";

export const metadata = { title: "Bot replies" };

export default async function RepliesPage() {
  const { tenant, db } = await requireLingoPage("/replies");
  const { data } = await db.from("fixed_messages").select("key, language, content, lingo_user_id").or(`lingo_user_id.eq.${tenant.id},lingo_user_id.is.null`).limit(5000);
  const map = new Map<string, ReplyEntry>();
  const entry = (key: string) => {
    if (!map.has(key)) {
      const known = REPLY_KEYS.find((k) => k.key === key);
      map.set(key, { key, label: known?.label ?? key.replace(/_/g, " "), group: known?.group ?? "Other", texts: {} });
    }
    return map.get(key)!;
  };
  for (const k of REPLY_KEYS) entry(k.key);
  for (const r of data ?? []) {
    const e = entry(r.key);
    const t = (e.texts[r.language] ??= { global: null, own: null });
    if (r.lingo_user_id === null) t.global = r.content;
    else t.own = r.content;
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Bot replies" description="The ready-made messages Lingo sends. Change the wording in your own style; words in {braces} are filled in automatically." />
      <RepliesEditor entries={[...map.values()]} languages={[...new Set([tenant.default_language, tenant.content_language, "si", "singlish", "en", "ta"])]} />
    </div>
  );
}
