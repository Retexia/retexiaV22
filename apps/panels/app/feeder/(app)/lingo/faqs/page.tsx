import { Alert, Card, EmptyState } from "@retexia/ui";
import { CircleHelp } from "lucide-react";
import { FaqDialog, FaqRow, PromoteButton } from "@/components/feeder/lingo/faqs";
import { faqs, lingoContext, products } from "@/lib/feeder/lingo/data";
import { LANG } from "@/lib/feeder/lingo/labels";

export const metadata = { title: "FAQs · Lingo" };

export default async function LingoFaqs() {
  const { ctx } = await lingoContext("/lingo/faqs");
  if (!ctx) return null;
  const list = await products(ctx.id);
  const { list: all, suggestions } = await faqs(ctx.id, list.map((p) => p.feeder_id).filter((x): x is number => Boolean(x)), list.map((p) => p.id));
  const hidden = new Set(ctx.seller.hidden_faqs.map(Number));
  if (!list.length) return <EmptyState icon={<CircleHelp aria-hidden size={22} strokeWidth={1.5} />} title="No products yet">Add your products in My products first.</EmptyState>;

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="info" title="FAQs make Lingo faster, cheaper and exactly right">
        When a customer asks something an FAQ answers, Lingo sends your answer word for word, no AI writing. A 👎 correction in the Inbox becomes an FAQ automatically.
      </Alert>
      {suggestions.length ? (
        <Card className="flex flex-col gap-3">
          <h2 className="type-h3 text-ink">Suggested: answers Lingo gave 5+ times</h2>
          <ul className="flex flex-col">
            {suggestions.map((s) => (
              <li key={s.key} className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="type-label text-ink">{s.q} <span className="type-small text-ink-muted">· {list.find((p) => p.id === s.product_id)?.name} · {LANG[s.lang] ?? s.lang} · {s.hits} times</span></p>
                  <p className="type-small whitespace-pre-wrap text-ink-muted">{s.answer}</p>
                </div>
                <PromoteButton cacheKey={s.key} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {list.map((p) => {
        const mine = all.filter((f) => f.lingo_user_id === ctx.id && f.product_id === p.id);
        const shared = all.filter((f) => f.lingo_user_id === null && p.feeder_id && f.product_id_feeder === p.feeder_id);
        return (
          <Card key={p.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="type-h3 text-ink">{p.name}</h2>
              <FaqDialog productId={p.id} trigger="Add FAQ" />
            </div>
            {mine.length || shared.length ? (
              <ul className="flex flex-col">
                {[...mine, ...shared].map((f) => (
                  <FaqRow key={f.id} faq={f} mine={f.lingo_user_id === ctx.id} hidden={hidden.has(f.id)} productId={p.id} />
                ))}
              </ul>
            ) : (
              <p className="type-small text-ink-muted">No FAQs yet. Add the questions customers ask most.</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
