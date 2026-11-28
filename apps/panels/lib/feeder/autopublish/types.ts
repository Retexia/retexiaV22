import type { Platform, TemplateData } from "./plan";

/** Rows of the feeder.ad_* tables (supabase/migrations/0036_feeder_autopublish.sql). */

export type ConnStatus = "none" | "requested" | "connected" | "problem";

export type AccountRow = {
  user_id: string;
  meta_ad_account_id: string | null;
  meta_page_id: string | null;
  meta_instagram_id: string | null;
  meta_pixel_id: string | null;
  meta_whatsapp: string | null;
  meta_status: ConnStatus;
  /** partner = shared with Retexia's business; token = the seller's own Business portfolio (Connections). */
  meta_via?: "partner" | "token";
  /** partner = shared with Retexia's Business Center; token = the seller's own TikTok access token (Connections). */
  tiktok_via?: "partner" | "token";
  tiktok_token_last4?: string | null;
  meta_info: MetaInfo;
  tiktok_advertiser_id: string | null;
  tiktok_identity_id: string | null;
  tiktok_identity_type: string | null;
  tiktok_status: ConnStatus;
  tiktok_info: TikTokInfo;
  currency: string;
  timezone: string;
  max_daily_spend: number | null;
  privacy_policy_url: string | null;
  approval_required: boolean;
  approver_whatsapp: string[];
  notify_whatsapp: string[];
  review_note: string | null;
  reviewed_at: string | null;
  updated_at: string;
};

export type FormInfo = { id: string; name: string; status?: string };

export type MetaInfo = {
  checked_at?: string;
  account_name?: string;
  account_status?: number;
  business_name?: string;
  currency?: string;
  timezone?: string;
  page_name?: string;
  instagram_name?: string;
  forms?: FormInfo[];
  problems?: string[];
};

export type TikTokInfo = {
  checked_at?: string;
  name?: string;
  status?: string;
  currency?: string;
  timezone?: string;
  identities?: { id: string; type: string; name: string }[];
  forms?: FormInfo[];
  problems?: string[];
};

export type LaunchState =
  | "awaiting_approval"
  | "rejected"
  | "expired"
  | "queued"
  | "building"
  | "activating"
  | "in_review"
  | "live"
  | "partly_live"
  | "needs_attention"
  | "paused"
  | "blocked"
  | "failed"
  | "cancelled";

export type Snapshot = {
  template: TemplateData;
  product: { id: number | null; name: string; form_name: string; form_names: string[]; price: number | null; details?: string | null; about?: string | null };
  currency: string;
  timezone: string;
  /** UTC ISO; null = as soon as it is approved and built. */
  starts_at: string | null;
  ends_at: string | null;
  /** Forms picked at launch (Destination.lead_form.mode = "pick", or a TikTok form). */
  forms: { meta: { id: string; name: string } | null; tiktok: { id: string; name: string } | null };
  /** The launch date in the customer's time zone (names). */
  date: string;
  /** The ad account this launch runs on, when the seller picked one of their portfolio's accounts (Connections). Missing = the default. */
  meta_ad_account?: { id: string; name: string | null } | null;
};

export type LaunchRow = {
  ref: string;
  user_id: string;
  template_id: string | null;
  template_version: number | null;
  template_name: string | null;
  product_id: number | null;
  product_name: string;
  form_name: string;
  snapshot: Snapshot;
  overrides: Record<string, unknown>;
  summary: string;
  totals: { meta?: number; tiktok?: number };
  warnings: { field: string; message: string; platform?: Platform }[];
  state: LaunchState;
  platform_state: Partial<Record<Platform, { activated_at?: string; problem?: string }>> & { reminded?: boolean };
  approval_code: string | null;
  approval_requested_at: string | null;
  approval_expires_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  reject_reason: string | null;
  problem: { message: string; fix_field?: string | null } | null;
  next_run_at: string | null;
  locked_until: string | null;
  locked_by: string | null;
  activated_at: string | null;
  last_notified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreativeRow = {
  launch_ref: string;
  position: number;
  name: string;
  storage_path: string;
  kind: "video" | "image";
  mime: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  approved: boolean;
};

export type NodeState =
  | "pending"
  | "processing_media"
  | "done"
  | "skipped"
  | "retry_wait"
  | "needs_fix"
  | "blocked"
  | "failed"
  | "in_review"
  | "live"
  | "scheduled"
  | "disapproved"
  | "with_issues"
  | "paused"
  | "archived";

export type NodeRow = {
  id: string;
  launch_ref: string;
  user_id: string;
  platform: Platform;
  key: string;
  level: "media" | "form" | "campaign" | "adset" | "creative" | "ad";
  parent_key: string | null;
  depends_on: string[];
  action: "create" | "reuse" | "slot";
  existing_id: string | null;
  creative_positions: number[];
  audience_index: number | null;
  name: string;
  budget_daily: number | null;
  budget_lifetime: number | null;
  spec: Record<string, unknown>;
  state: NodeState;
  platform_id: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  platform_extra: Record<string, any>;
  review: { status?: string; reasons?: string[]; checked_at?: string } | null;
  resubmits: number;
  error_code: string | null;
  error_category: string | null;
  error_message: string | null;
  fix_field: string | null;
  attempts: number;
  next_run_at: string;
  updated_at: string;
};

export type EventRow = { id: number; launch_ref: string | null; type: string; actor: string; message: string; created_at: string };

/** States in which a launch still has work (or watching) to do. */
export const ACTIVE_LAUNCH: LaunchState[] = ["awaiting_approval", "queued", "building", "activating", "in_review", "live", "partly_live", "needs_attention", "blocked"];
/** Node states that are finished with building (good or bad). */
export const SETTLED: NodeState[] = ["done", "skipped", "needs_fix", "blocked", "failed", "in_review", "live", "scheduled", "disapproved", "with_issues", "paused", "archived"];
/** Node states that count as "made and fine". */
export const BUILT: NodeState[] = ["done", "in_review", "live", "scheduled", "disapproved", "with_issues", "paused", "archived"];
export const PROBLEM: NodeState[] = ["needs_fix", "blocked", "failed"];
