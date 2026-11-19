import type { Tone } from "@retexia/ui";

/** Launch and step states in plain words, with a badge colour. */
export const LAUNCH_STATE: Record<string, { label: string; tone: Tone }> = {
  awaiting_approval: { label: "Waiting for approval", tone: "warning" },
  rejected: { label: "Rejected", tone: "neutral" },
  expired: { label: "Approval expired", tone: "neutral" },
  queued: { label: "Starting", tone: "brand" },
  building: { label: "Building", tone: "brand" },
  activating: { label: "Switching on", tone: "brand" },
  in_review: { label: "In review", tone: "brand" },
  live: { label: "Live", tone: "success" },
  partly_live: { label: "Partly live", tone: "warning" },
  needs_attention: { label: "Needs your attention", tone: "danger" },
  paused: { label: "Paused", tone: "neutral" },
  blocked: { label: "On hold", tone: "danger" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const NODE_STATE: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Waiting", tone: "neutral" },
  processing_media: { label: "Processing", tone: "brand" },
  done: { label: "Made", tone: "success" },
  skipped: { label: "Skipped", tone: "neutral" },
  retry_wait: { label: "Retrying soon", tone: "warning" },
  needs_fix: { label: "Needs a fix", tone: "danger" },
  blocked: { label: "On hold", tone: "danger" },
  failed: { label: "Failed", tone: "danger" },
  in_review: { label: "In review", tone: "brand" },
  live: { label: "Live", tone: "success" },
  scheduled: { label: "Scheduled", tone: "brand" },
  disapproved: { label: "Not approved", tone: "danger" },
  with_issues: { label: "Has issues", tone: "warning" },
  paused: { label: "Paused", tone: "neutral" },
  archived: { label: "Archived", tone: "neutral" },
};

export const LEVEL_LABEL: Record<string, { meta: string; tiktok: string }> = {
  media: { meta: "Upload", tiktok: "Upload" },
  form: { meta: "Instant Form", tiktok: "Instant Form" },
  campaign: { meta: "Campaign", tiktok: "Campaign" },
  adset: { meta: "Ad set", tiktok: "Ad group" },
  creative: { meta: "Creative", tiktok: "Creative" },
  ad: { meta: "Ad", tiktok: "Ad" },
};

export const CONN_STATE: Record<string, { label: string; tone: Tone }> = {
  none: { label: "Not connected", tone: "neutral" },
  requested: { label: "Waiting for Retexia", tone: "warning" },
  connected: { label: "Connected", tone: "success" },
  problem: { label: "Needs attention", tone: "danger" },
};

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
