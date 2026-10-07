import { Card } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import { CreateForm } from "@/components/post/create-form";
import { PostCard } from "@/components/post/post-card";
import { PLAN_LIMITS } from "@/lib/post/plans";
import { toViews } from "@/lib/post/posts";
import { requireBusinessPage } from "@/lib/post/session";
import { localDate } from "@/lib/time";

export const metadata = { title: "New post" };

export default async function CreatePage() {
  const { business, settings, db } = await requireBusinessPage("/create");
  const period = `${localDate(business.timezone).slice(0, 7)}-01`;
  const [{ data: products }, { data: recent }, { data: usage }] = await Promise.all([
    db.from("products").select("name, price, currency").eq("business_id", business.id).eq("active", true).order("created_at", { ascending: false }).limit(12),
    db.from("posts").select("*").eq("business_id", business.id).eq("source", "manual").order("created_at", { ascending: false }).limit(6),
    db.from("usage_monthly").select("images").eq("business_id", business.id).eq("period", period).maybeSingle(),
  ]);
  const views = await toViews(db, business.id, business.timezone, recent ?? []);
  const limit = PLAN_LIMITS[business.plan].images;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New post" description="Describe the post. We write the captions, design the picture with your brand, then publish to Facebook and Instagram, or save it for you to check." />
      <CreateForm
        products={(products ?? []).map((p) => (p.price == null ? p.name : `${p.name} (${p.currency} ${Number(p.price).toLocaleString("en-US")})`))}
        paused={settings.paused}
        remaining={Math.max(0, limit - (usage?.images ?? 0))}
        latestCreatedAt={recent?.[0]?.created_at ?? null}
      />
      <section className="flex flex-col gap-4">
        <h2 className="type-h2 text-ink">Your recent requests</h2>
        {views.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {views.map((v) => (
              <PostCard key={v.id} post={v} autoPublish={settings.auto_publish} compact />
            ))}
          </div>
        ) : (
          <Card>
            <p className="type-body text-ink-muted">Posts you make here appear below, and in your calendar.</p>
          </Card>
        )}
      </section>
    </div>
  );
}
