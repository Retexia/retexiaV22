"use client";

import { Badge, Button, Card, StatusBadge, cn } from "@retexia/ui";
import { ConfirmDialog } from "@retexia/ui/admin";
import { Check, Clock, Copy, Download, ExternalLink, ImageOff, Languages, Lock, Pencil, RotateCcw, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { approvePost, retryPost } from "@/app/post/actions";
import { deletePost, designNow } from "@/app/post/playlist-actions";
import { captionLanguageLabel, designLanguageLabel } from "@/lib/post/languages";
import type { PostView } from "@/lib/post/posts";
import { FORMAT_LABEL, STATUS } from "@/lib/post/status";
import { FacebookTextDialog, ItemDialog, RedoDialog, TimeDialog } from "./item-dialogs";

/**
 * One playlist item (post or story) with everything the owner can do at its
 * stage: write the prompt, design now, approve, redo, change the time, edit
 * the published Facebook text, delete (also from Facebook and Instagram).
 */
export function PostCard({ post, autoPublish, defaults, compact = false }: { post: PostView; autoPublish: boolean; defaults: { caption: string; design: string }; compact?: boolean }) {
  const router = useRouter();
  const [platform, setPlatform] = useState<"instagram" | "facebook">("instagram");
  const [dialog, setDialog] = useState<null | "item" | "redo" | "time" | "fb" | "delete">(null);
  const [busy, setBusy] = useState<string | null>(null);
  const s = STATUS[post.status];
  const caption = platform === "instagram" ? post.instagram + (post.hashtags.length ? `\n\n${post.hashtags.map((t) => `#${t}`).join(" ")}` : "") : post.facebook;
  const designed = Boolean(post.imageUrl);
  const unpublished = !post.live && !["publishing", "published", "removed"].includes(post.status);
  const cl = post.captionLanguage ?? defaults.caption;
  const dl = post.designLanguage ?? defaults.design;

  const act = async (key: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    toast[r.ok ? "success" : "error"](r.message ?? "");
    router.refresh();
  };

  const hint =
    post.status === "planned"
      ? `Designed before ${post.time}. Change the idea any time until then.`
      : post.status === "ready"
        ? autoPublish
          ? `Goes out at ${post.time} unless you change it`
          : `Approve before ${post.time} or it is skipped`
        : post.status === "approved"
          ? `Goes out at ${post.time}`
          : post.status === "needs_manual"
            ? (post.denyReason && !["caption", "image", "both", "wrong_product"].includes(post.denyReason) ? post.denyReason : "Needs you: change the idea and design again, or delete it.")
            : post.status === "failed"
              ? "Couldn't publish. Retry, or post it yourself"
              : post.status === "removed"
                ? "Deleted from Facebook and Instagram"
                : null;

  return (
    <Card padded={false} className={cn("flex flex-col overflow-hidden", post.status === "needs_manual" || post.status === "failed" ? "ring-1 ring-danger/40" : "", post.status === "removed" && "opacity-60")}>
      <div className="relative bg-surface-sunk">
        {designed ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
          <img src={post.imageUrl!} alt="" className={cn("w-full object-cover", post.isStory ? "aspect-[9/16] max-h-96" : "aspect-[4/5]")} loading="lazy" />
        ) : (
          <div className={cn("flex w-full flex-col items-center justify-center gap-2 p-4 text-center text-ink-muted", post.isStory ? "aspect-[9/16] max-h-96" : "aspect-[4/5]")}>
            {["generating", "denied", "safety_review"].includes(post.status) ? (
              <span className="flex animate-pulse items-center gap-2 type-small">
                <Sparkles aria-hidden size={16} strokeWidth={1.5} /> Designing…
              </span>
            ) : post.status === "planned" ? (
              <>
                <Wand2 aria-hidden size={24} strokeWidth={1.5} />
                <span className={cn("type-small text-ink", compact && "line-clamp-6")}>{post.prompt || "No idea written yet"}</span>
              </>
            ) : (
              <ImageOff aria-hidden size={28} strokeWidth={1.5} />
            )}
          </div>
        )}
        <span className="absolute top-2 left-2 flex flex-wrap gap-1.5">
          <Badge tone="neutral" className="bg-surface-raised/90!">
            {post.time} · {FORMAT_LABEL[post.format] ?? post.format}
          </Badge>
          {!post.inPlaylist ? (
            <Badge tone="neutral" className="bg-surface-raised/90!">
              By you
            </Badge>
          ) : null}
          {post.locked && ["ready", "approved"].includes(post.status) ? (
            <Badge tone="neutral" className="bg-surface-raised/90!">
              <Lock aria-hidden size={12} strokeWidth={1.5} /> Locked
            </Badge>
          ) : null}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusBadge tone={s.tone} label={s.label} />
          {post.regenLeft < 10 ? <span className="type-caption text-ink-muted">{post.regenLeft} of 10 new versions left</span> : null}
        </div>
        {post.title && post.status !== "planned" ? <p className="type-label text-ink">{post.title}</p> : null}
        <p className="flex items-center gap-1.5 type-caption text-ink-muted">
          <Languages aria-hidden size={13} strokeWidth={1.5} />
          {post.isStory ? `Picture: ${designLanguageLabel(dl)}` : `Caption: ${captionLanguageLabel(cl)} · Picture: ${designLanguageLabel(dl)}`}
        </p>
        {hint ? <p className="type-small text-ink-muted">{hint}</p> : null}

        {designed && !post.isStory && (post.facebook || post.instagram) ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-1" role="tablist" aria-label="Caption for">
              {(["instagram", "facebook"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={platform === p}
                  onClick={() => setPlatform(p)}
                  className={cn("h-7 rounded-full px-3 type-caption", platform === p ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface-sunk")}
                >
                  {p === "instagram" ? "Instagram" : "Facebook"}
                </button>
              ))}
            </div>
            <p className={cn("type-small whitespace-pre-line text-ink", compact && "line-clamp-4")}>{caption}</p>
          </div>
        ) : null}

        {post.publications.length ? (
          <ul className="flex flex-col gap-1">
            {post.publications.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-2 type-small">
                <span className="capitalize text-ink">{p.name ?? p.platform}</span>
                {p.status === "published" ? (
                  p.permalink ? (
                    <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link">
                      View <ExternalLink aria-hidden size={12} strokeWidth={1.5} />
                    </a>
                  ) : (
                    <span className="text-success">Published</span>
                  )
                ) : (
                  <span className={p.status === "failed" ? "text-danger" : "text-ink-muted"} title={p.error ?? undefined}>
                    {p.status === "failed" ? "Failed" : p.status === "retrying" ? "Retrying" : p.status === "removed" ? "Deleted" : "Waiting"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {/* Not designed yet */}
          {["planned", "needs_manual"].includes(post.status) && !designed && !post.locked ? (
            <>
              <Button size="sm" variant="secondary" icon={<Pencil aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setDialog("item")}>
                Change idea
              </Button>
              <Button size="sm" loading={busy === "design"} icon={<Sparkles aria-hidden size={14} strokeWidth={1.5} />} onClick={() => act("design", () => designNow({ id: post.id }))}>
                Design now
              </Button>
            </>
          ) : null}

          {/* Designed, not out yet */}
          {post.status === "ready" && !post.locked ? (
            <Button size="sm" loading={busy === "approve"} icon={<Check aria-hidden size={14} strokeWidth={1.5} />} onClick={() => act("approve", () => approvePost({ id: post.id }))}>
              Approve
            </Button>
          ) : null}
          {designed && unpublished && !post.locked && post.status !== "generating" ? (
            <>
              <Button size="sm" variant="secondary" href={`/posts/${post.id}`} icon={<Pencil aria-hidden size={14} strokeWidth={1.5} />}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" icon={<RotateCcw aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setDialog("redo")}>
                Redo
              </Button>
            </>
          ) : null}
          {unpublished && !post.locked && ["planned", "ready", "approved", "needs_manual"].includes(post.status) ? (
            <Button size="sm" variant="ghost" icon={<Clock aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setDialog("time")}>
              Time
            </Button>
          ) : null}

          {/* Out */}
          {post.live && !post.isStory ? (
            <Button size="sm" variant="secondary" icon={<Pencil aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setDialog("fb")}>
              Edit on Facebook
            </Button>
          ) : null}
          {post.status === "failed" ? (
            <Button size="sm" loading={busy === "retry"} icon={<RotateCcw aria-hidden size={14} strokeWidth={1.5} />} onClick={() => act("retry", () => retryPost({ id: post.id }))}>
              Retry now
            </Button>
          ) : null}
          {(post.status === "failed" || post.status === "expired") && designed ? (
            <>
              <Button size="sm" variant="ghost" href={post.imageUrl!} target="_blank" icon={<Download aria-hidden size={14} strokeWidth={1.5} />}>
                Picture
              </Button>
              {!post.isStory ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Copy aria-hidden size={14} strokeWidth={1.5} />}
                  onClick={async () => {
                    await navigator.clipboard.writeText(caption);
                    toast.success("Caption copied");
                  }}
                >
                  Copy caption
                </Button>
              ) : null}
            </>
          ) : null}
          {post.status !== "removed" && post.status !== "publishing" && post.status !== "generating" ? (
            <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setDialog("delete")}>
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      {dialog === "item" ? (
        <ItemDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          initial={{ id: post.id, title: post.title, prompt: post.prompt, time: post.time, caption_language: cl, design_language: dl }}
        />
      ) : null}
      {dialog === "redo" ? <RedoDialog open onOpenChange={(o) => !o && setDialog(null)} id={post.id} prompt={post.prompt} captionLanguage={cl} designLanguage={dl} left={post.regenLeft} /> : null}
      {dialog === "time" ? <TimeDialog open onOpenChange={(o) => !o && setDialog(null)} id={post.id} time={post.time} /> : null}
      {dialog === "fb" ? <FacebookTextDialog open onOpenChange={(o) => !o && setDialog(null)} id={post.id} text={post.facebook} /> : null}
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={post.live ? "Delete from Facebook and Instagram?" : "Delete this item?"}
        description={
          post.live
            ? "It is removed from every account it was published to. This can't be undone."
            : post.inPlaylist
              ? "It leaves today's playlist and nothing goes out at that time. You can add a new item instead."
              : "It is deleted and nothing goes out."
        }
        confirmLabel={post.live ? "Delete everywhere" : "Delete"}
        danger
        onConfirm={async () => {
          await act("delete", () => deletePost({ id: post.id }));
          setDialog(null);
        }}
      />
    </Card>
  );
}
