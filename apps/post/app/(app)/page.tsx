import { Alert, Button, Card } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import { ApproveDay } from "@/components/approve-day";
import { PostCard } from "@/components/post-card";
import type { Brand } from "@/lib/post-db.types";
import { toViews } from "@/lib/posts";
import { requireBusinessPage } from "@/lib/session";
import { addDays, dayLabel, localDate } from "@/lib/time";

export const metadata = { title: "Today" };

export default async function TodayPage() {
  const { customer, business, settings, db } = await requireBusinessPage("/");
  const today = localDate(business.timezone);
  const tomorrow = addDays(today, 1);
  const [{ data: posts }, { data: accounts }, { count: products }] = await Promise.all([
    db.from("posts").select("*").eq("business_id", business.id).in("local_date", [today, tomorrow]).order("scheduled_at"),
    db.from("social_accounts").select("id, platform, status, enabled, display_name").eq("business_id", business.id),
    db.from("products").select("id", { count: "exact", head: true }).eq("business_id", business.id),
  ]);
  const views = await toViews(db, business.id, business.timezone, posts ?? []);
  const todays = views.filter((v) => v.date === today);
  const tomorrows = views.filter((v) => v.date === tomorrow);
  const reconnect = (accounts ?? []).filter((a) => a.status !== "connected");
  const brand = (business.brand ?? {}) as Brand;
  const steps = [
    { done: Boolean(business.brand_brief || brand.colors?.length || brand.logo_path), label: "Add your brand: logo, colours and voice", href: "/brand" },
    { done: (products ?? 0) > 0, label: "Add the products or services to promote", href: "/products" },
    { done: (accounts ?? []).some((a) => a.status === "connected"), label: "Connect Facebook and Instagram", href: "/accounts" },
  ];
  const first = customer.name.split(" ")[0];

  const section = (title: string, list: typeof views, date: string) => (
    <section className="flex flex-col gap-4" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="type-h2 text-ink">{title}</h2>
        <ApproveDay date={date} count={list.filter((v) => v.status === "ready" && !v.locked).length} />
      </div>
      {list.length ? (
        <>
          {list.some((v) => !v.isStory) ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.filter((v) => !v.isStory).map((v) => (
                <PostCard key={v.id} post={v} autoPublish={settings.auto_publish} compact />
              ))}
            </div>
          ) : null}
          {list.some((v) => v.isStory) ? (
            <>
              <h3 className="type-label text-ink-muted">Stories</h3>
              <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {list.filter((v) => v.isStory).map((v) => (
                  <PostCard key={v.id} post={v} autoPublish={settings.auto_publish} compact />
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : (
        <Card>
          <p className="type-body text-ink-muted">
            {date === today ? "No posts for today yet. Posts are prepared every night; you can also make one now." : "Tomorrow's posts are prepared tonight."}
          </p>
          {date === today ? (
            <Button href="/create" size="sm" className="mt-3">
              Make a post now
            </Button>
          ) : null}
        </Card>
      )}
    </section>
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={first ? `Hi ${first}` : "Today"}
        description={settings.auto_publish ? "Your posts go out on their own. Change or stop anything up to 15 minutes before its time." : "Manual approval is on: approve each post before its time, or it is skipped."}
      />
      {settings.paused ? (
        <Alert tone="warning" title="Publishing is paused" action={<Button href="/settings" size="sm" variant="secondary">Turn back on</Button>}>
          Nothing is published until you turn it back on.
        </Alert>
      ) : null}
      {reconnect.length ? (
        <Alert tone="danger" title="Reconnect needed" action={<Button href="/accounts" size="sm" variant="secondary">See accounts</Button>}>
          {reconnect.map((a) => a.display_name ?? a.platform).join(", ")} can&apos;t be posted to until it is connected again.
        </Alert>
      ) : null}
      {steps.some((s) => !s.done) ? (
        <Card className="flex flex-col gap-3">
          <h2 className="type-h3 text-ink">Finish setting up</h2>
          <ol className="flex flex-col gap-2">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-3">
                <span className={s.done ? "type-body text-ink-muted line-through" : "type-body text-ink"}>{s.label}</span>
                {s.done ? null : (
                  <Button href={s.href} size="sm" variant="secondary">
                    Open
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
      {section(dayLabel(today, today), todays, today)}
      {section(dayLabel(tomorrow, today), tomorrows, tomorrow)}
    </div>
  );
}
