import { Alert, Button, Card, cn } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import { ListMusic } from "lucide-react";
import Link from "next/link";
import { AddItem } from "@/components/post/add-item";
import { ApproveDay } from "@/components/post/approve-day";
import { PostCard } from "@/components/post/post-card";
import { captionLanguageLabel, designLanguageLabel } from "@/lib/post/languages";
import { PLAN_LIMITS, defaultTimes } from "@/lib/post/plans";
import { PLAYLIST_SLOTS } from "@/lib/post/playlist";
import type { Brand } from "@/lib/post/post-db.types";
import { toViews, type PostView } from "@/lib/post/posts";
import { requireBusinessPage } from "@/lib/post/session";
import { addDays, dayLabel, localDate } from "@/lib/time";

export const metadata = { title: "Playlist" };

export default async function PlaylistPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const [{ customer, business, settings, db }, sp] = await Promise.all([requireBusinessPage("/"), searchParams]);
  const today = localDate(business.timezone);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const date = sp.date && days.includes(sp.date) ? sp.date : today;
  const [{ data: posts }, { data: accounts }, { count: products }] = await Promise.all([
    db.from("posts").select("*").eq("business_id", business.id).eq("local_date", date).order("scheduled_at"),
    db.from("social_accounts").select("id, platform, status, enabled, display_name").eq("business_id", business.id),
    db.from("products").select("id", { count: "exact", head: true }).eq("business_id", business.id),
  ]);
  const views = await toViews(db, business.id, business.timezone, posts ?? []);
  const limits = PLAN_LIMITS[business.plan];
  const defaults = { caption: settings.caption_language, design: settings.design_language };
  const lane = (story: boolean) => views.filter((v) => v.isStory === story);
  const used = (story: boolean) => views.filter((v) => v.isStory === story && v.inPlaylist).length;
  const nextTime = (story: boolean) => {
    const times = story ? settings.playlist.story_times : settings.playlist.post_times;
    const taken = new Set(views.filter((v) => v.isStory === story).map((v) => v.time));
    return times.find((t) => !taken.has(t)) ?? defaultTimes(PLAYLIST_SLOTS, story).find((t) => !taken.has(t)) ?? "18:00";
  };

  const reconnect = (accounts ?? []).filter((a) => a.status !== "connected");
  const connected = (accounts ?? []).some((a) => a.status === "connected" && a.enabled);
  const brand = (business.brand ?? {}) as Brand;
  const steps = [
    { done: Boolean(business.brand_brief || brand.colors?.length || brand.logo_path), label: "Add your brand: logo, colours and voice", href: "/brand" },
    { done: (products ?? 0) > 0, label: "Add the products or services to promote", href: "/products" },
    { done: connected, label: "Connect Facebook and Instagram", href: "/accounts" },
  ];
  const first = customer.name.split(" ")[0];

  const laneView = (story: boolean, title: string, max: number) => {
    const list = lane(story);
    return (
      <section className="flex flex-col gap-3" aria-label={title}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="type-h3 text-ink">
            {title} <span className="type-small text-ink-muted">{used(story)} of {max} in the playlist</span>
          </h2>
          {max > 0 ? <AddItem date={date} format={story ? "story" : "post"} used={used(story)} max={max} defaultTime={nextTime(story)} defaults={defaults} /> : null}
        </div>
        {list.length ? (
          <div className={cn("grid gap-4", story ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5" : "sm:grid-cols-2 xl:grid-cols-3")}>
            {list.map((v: PostView) => (
              <PostCard key={v.id} post={v} autoPublish={settings.auto_publish} defaults={defaults} compact />
            ))}
          </div>
        ) : (
          <Card>
            <p className="type-body text-ink-muted">
              {max === 0
                ? `Your playlist has no ${story ? "stories" : "posts"}. Change it in Settings.`
                : date === today
                  ? `No ${story ? "stories" : "posts"} today. Add one now, or tomorrow's playlist is written at 6 AM.`
                  : date === addDays(today, 1)
                    ? "Tomorrow's playlist is written at 6 AM. You can add items yourself now."
                    : "Add items for this day now, or plan it in the week plan."}
            </p>
          </Card>
        )}
      </section>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={first ? `Hi ${first}` : "Playlist"}
        description={`Every morning at 6 AM, tomorrow's playlist is written: ${settings.playlist.posts} post${settings.playlist.posts === 1 ? "" : "s"} and ${settings.playlist.stories} stor${settings.playlist.stories === 1 ? "y" : "ies"}. Everything is designed overnight, ready by 6 AM, and goes out at its time. Change, redo or delete anything until 15 minutes before.`}
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

      <nav aria-label="Day" className="flex flex-wrap gap-1">
        {days.map((d) => (
          <Link
            key={d}
            href={d === today ? "/" : `/?date=${d}`}
            aria-current={d === date ? "page" : undefined}
            className={cn("inline-flex h-9 items-center rounded-full px-4 type-label", d === date ? "bg-brand text-on-brand" : "text-ink-muted hover:bg-surface-sunk")}
          >
            {dayLabel(d, today)}
          </Link>
        ))}
      </nav>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 type-small text-ink-muted">
          <ListMusic aria-hidden size={16} strokeWidth={1.5} />
          Captions in {captionLanguageLabel(settings.caption_language)} · text on pictures in {designLanguageLabel(settings.design_language)} ·{" "}
          <Link href="/settings" className="text-link">
            change
          </Link>
        </span>
        <ApproveDay date={date} count={views.filter((v) => v.status === "ready" && !v.locked).length} />
      </Card>

      {laneView(false, "Posts", limits.postsPerDay)}
      {laneView(true, "Stories", limits.storiesPerDay)}
    </div>
  );
}
