import { Placeholders, RulesEditor, TextEditor } from "@/components/feeder/lingo/texts";
import { fixedTexts, lingoContext, quickRules } from "@/lib/feeder/lingo/data";
import { FIXED } from "@/lib/feeder/lingo/labels";

export const metadata = { title: "Messages & buttons · Lingo" };

export default async function LingoMessages() {
  const { ctx } = await lingoContext("/lingo/messages");
  if (!ctx) return null;
  const [{ defaults, own }, rules] = await Promise.all([fixedTexts(ctx.id), quickRules(ctx.id)]);
  const shop = {
    "{business}": ctx.seller.business_name || "Your shop",
    "{shop_phone}": ctx.seller.shop_phone || "07X XXX XXXX",
    "{shop_address}": ctx.seller.shop_address || "Your address",
    "{delivery_days}": String(ctx.seller.delivery_days),
  };
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="type-body text-ink-muted">Every text and button customers can get from Lingo. Leave a field empty to keep Retexia&apos;s wording (shown in grey).</p>
        <Placeholders />
      </div>
      {FIXED.map((g) => (
        <section key={g.group} className="flex flex-col gap-3">
          <h2 className="type-h2 text-ink">{g.group}</h2>
          {g.items.map((i) => (
            <TextEditor key={i.key} k={i.key} label={i.label} kind={i.kind} hint={i.hint} defaults={defaults[i.key] ?? { si: "", en: "" }} own={own[i.key]} shop={shop} />
          ))}
        </section>
      ))}
      <section className="flex flex-col gap-3">
        <h2 className="type-h2 text-ink">Rules</h2>
        <RulesEditor rules={rules} disabled={ctx.seller.disabled_rules.map(Number)} />
      </section>
    </div>
  );
}
