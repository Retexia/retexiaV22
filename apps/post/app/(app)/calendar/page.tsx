import { Card, StatusBadge, cn } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import { ImageOff } from "lucide-react";
import Link from "next/link";
import { toViews } from "@/lib/posts";
import { requireBusinessPage } from "@/lib/session";
import { FORMAT_LABEL, STATUS } from "@/lib/status";
import { addDays, dayLabel, localDate } from "@/lib/time";

export const metadata = { title: "Calendar" };

const VIEWS = [
  { key: "upcoming", label: "Next 14 days" },
  { key: "past", label: "Last 30 days" },
  { key: "problems", label: "Needs attention" },
] as const;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const view = (VIEWS.find((v) => v.key === sp.view)?.key ?? "upcoming") as (typeof VIEWS)[number]["key"];
  const { business, db } = await requireBusinessPage("/calendar");
  const today = localDate(business.timezone);
  let q = db.from("posts").select("*").eq("business_id", business.id);
  if (view === "upcoming") q = q.gte("local_date", today).lte("local_date", addDays(today, 13)).order("scheduled_at");
  else if (view === "past") q = q.lt("local_date", today).gte("local_date", addDays(today, -30)).order("scheduled_at", { ascending: false });
  else q = q.in("status", ["needs_manual", "failed", "blocked"]).order("scheduled_at", { ascending: false });
  const { data } = await q.limit(300);
  const views = await toViews(db, business.id, business.timezone, data ?? []);
  const days = [...new Set(views.map((v) => v.date))];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Calendar" description="Every post and story, by day. Open one to change its caption, photo or time." />
      <nav aria-label="Show" className="flex flex-wrap gap-1">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={v.key === "upcoming" ? "/calendar" : `/calendar?view=${v.key}`}
            aria-current={view === v.key ? "page" : undefined}
            className={cn("inline-flex h-8 items-center rounded-full px-3 type-label", view === v.key ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface-sunk")}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      {days.length ? (
        days.map((d) => (
          <section key={d} className="flex flex-col gap-2" aria-label={d}>
            <h2 className="type-h3 text-ink">
              {dayLabel(d, today)} <span className="type-small text-ink-muted">{d}</span>
            </h2>
            <Card padded={false}>
              <ul className="divide-y divide-line">
                {views
                  .filter((v) => v.date === d)
                  .map((v) => (
                    <li key={v.id}>
                      <Link href={`/posts/${v.id}`} className="flex items-center gap-4 px-4 py-3 transition-hover hover:bg-surface-sunk focus-visible:focus-ring">
                        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-sunk text-ink-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL */}
                          {v.imageUrl ? <img src={v.imageUrl} alt="" className="size-full object-cover" loading="lazy" /> : <ImageOff aria-hidden size={18} strokeWidth={1.5} />}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="type-label text-ink">{v.time}</span>
                            <span className="type-small text-ink-muted">{FORMAT_LABEL[v.format] ?? v.format}</span>
                            <StatusBadge tone={STATUS[v.status].tone} label={STATUS[v.status].label} />
                          </span>
                          <span className="truncate type-small text-ink-muted">{v.instagram || v.facebook || "Caption is being written…"}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </Card>
          </section>
        ))
      ) : (
        <Card>
          <p className="type-body text-ink-muted">{view === "problems" ? "Nothing needs your attention." : "No posts here yet."}</p>
        </Card>
      )}
    </div>
  );
}
