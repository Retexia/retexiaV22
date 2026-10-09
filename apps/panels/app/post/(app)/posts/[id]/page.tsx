import { notFound } from "next/navigation";
import { PageHeader } from "@retexia/ui/admin";
import { PostCard } from "@/components/post/post-card";
import { PostEditor } from "@/components/post/post-editor";
import { mediaUrls } from "@/lib/post/media";
import { toViews } from "@/lib/post/posts";
import { requireBusinessPage } from "@/lib/post/session";
import { dayLabel, localDate } from "@/lib/time";

export const metadata = { title: "Post" };

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { business, settings, db } = await requireBusinessPage(`/posts/${id}`);
  const { data: post } = await db.from("posts").select("*").eq("id", id).eq("business_id", business.id).maybeSingle();
  if (!post) notFound();
  const [view] = await toViews(db, business.id, business.timezone, [post], true);
  const { data: library } = await db.from("media").select("id, storage_path, thumb_path, description, kind").eq("business_id", business.id).eq("kind", "photo").order("created_at", { ascending: false }).limit(60);
  const thumbs = await mediaUrls(db, library ?? []);
  const today = localDate(business.timezone);
  const editable = !view!.locked && !view!.live && Boolean(view!.imageUrl) && ["ready", "approved", "needs_manual", "denied", "blocked"].includes(post.status);
  const brief = view!.brief;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={{ href: post.local_date === today ? "/" : `/?date=${post.local_date}`, label: "Playlist" }} title={`${dayLabel(post.local_date, today)}, ${view!.time}`} description={typeof brief.prompt === "string" && brief.prompt ? `Idea: ${brief.prompt}` : undefined} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <PostCard post={view!} autoPublish={settings.auto_publish} defaults={{ caption: settings.caption_language, design: settings.design_language }} />
        </div>
        <PostEditor
          post={view!}
          editable={editable}
          library={(library ?? []).map((m) => ({ id: m.id, url: thumbs.get(m.id) ?? null, description: m.description }))}
          dropped={Array.isArray(brief.dropped_text) ? (brief.dropped_text as string[]) : []}
        />
      </div>
    </div>
  );
}
