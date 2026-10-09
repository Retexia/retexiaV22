import type { PostStatus } from "./post-db.types";

export const STATUS: Record<PostStatus, { label: string; tone: "neutral" | "brand" | "success" | "warning" | "danger" }> = {
  planned: { label: "Planned", tone: "neutral" },
  generating: { label: "Being designed", tone: "brand" },
  safety_review: { label: "Being checked", tone: "brand" },
  ready: { label: "Ready", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  publishing: { label: "Publishing", tone: "brand" },
  published: { label: "Published", tone: "success" },
  denied: { label: "Making a new version", tone: "brand" },
  needs_manual: { label: "Needs you", tone: "danger" },
  blocked: { label: "Held back", tone: "danger" },
  expired: { label: "Skipped", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
  removed: { label: "Deleted", tone: "neutral" },
};

export const FORMAT_LABEL: Record<string, string> = { photo: "Photo", carousel: "Carousel", reel: "Reel", story_photo: "Story", story_video: "Video story" };
