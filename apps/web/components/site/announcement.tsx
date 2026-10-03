import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { getSiteSettings } from "@/lib/content";

export async function AnnouncementBar() {
  const settings = await getSiteSettings();
  if (!settings.announcement_enabled || !settings.announcement_text) return null;
  const href = settings.announcement_href;
  const content = (
    <>
      <span>{settings.announcement_text}</span>
      {href ? <ArrowRight aria-hidden size={14} strokeWidth={1.5} className="shrink-0" /> : null}
    </>
  );
  return (
    <div className="bg-brand-soft text-brand">
      <div className="mx-auto flex max-w-[calc(var(--rx-container)_+_2_*_var(--rx-gutter))] justify-center px-gutter py-2 text-center type-label">
        {href ? (
          <Link href={href} className="inline-flex items-center gap-2 rounded-sm hover:text-brand-hover focus-visible:focus-ring">
            {content}
          </Link>
        ) : (
          <p className="inline-flex items-center gap-2">{content}</p>
        )}
      </div>
    </div>
  );
}
