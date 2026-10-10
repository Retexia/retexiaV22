/**
 * Types for the "post" schema (supabase/migrations/0005_post_schema.sql), in
 * the format `supabase gen types` produces.
 */
import type { CaptionLanguage, DesignLanguage } from "./languages";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type PlanTier = "trial" | "starter" | "growth" | "pro";
export type Platform = "facebook" | "instagram";
export type PostFormat = "photo" | "carousel" | "reel" | "story_photo" | "story_video";
export type PostStatus = "planned" | "generating" | "safety_review" | "ready" | "approved" | "publishing" | "published" | "denied" | "needs_manual" | "blocked" | "expired" | "failed" | "removed";
export type PubStatus = "pending" | "publishing" | "published" | "retrying" | "failed" | "removed";

type Table<Row, Required extends keyof Row = never> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export type BusinessRow = {
  id: string;
  owner_id: string;
  name: string;
  category: string | null;
  country: string;
  timezone: string;
  languages: string[];
  plan: PlanTier;
  subscription_status: "trialing" | "active" | "past_due" | "canceled";
  billing_customer_id: string | null;
  brand: Json;
  brand_brief: string | null;
  settings: Json;
  onboarding_done: boolean;
  last_batch_date: string | null;
  last_plan_date: string | null;
  created_at: string;
  updated_at: string;
};

export type SocialAccountRow = {
  id: string;
  business_id: string;
  platform: Platform;
  external_id: string;
  display_name: string | null;
  avatar_url: string | null;
  ig_account_type: "business" | "creator" | null;
  meta_user_id: string | null;
  enabled: boolean;
  status: "connected" | "reconnect_needed" | "disconnected";
  token_secret_id: string | null;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductRow = {
  id: string;
  business_id: string;
  name: string;
  price: number | null;
  currency: string;
  description: string | null;
  active: boolean;
  created_at: string;
};

export type ProductGroupRow = {
  id: string;
  business_id: string;
  name: string;
  product_ids: string[];
  created_at: string;
  updated_at: string;
};

export type MediaRow = {
  id: string;
  business_id: string;
  product_id: string | null;
  kind: "photo" | "video";
  source: "upload" | "ai" | "render";
  storage_path: string;
  thumb_path: string | null;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  bytes: number | null;
  description: string | null;
  tags: string[];
  embedding: string | null;
  last_used_at: string | null;
  created_at: string;
};

export type PlanItemRow = {
  id: string;
  business_id: string;
  type: "week_note" | "offer";
  start_date: string;
  end_date: string;
  slot: number | null;
  slots_per_day: number | null;
  format: PostFormat | null;
  note: string | null;
  media_id: string | null;
  details: Json;
  active: boolean;
  created_at: string;
};

export type PostRow = {
  id: string;
  business_id: string;
  local_date: string;
  slot: number;
  format: PostFormat;
  is_story: boolean;
  scheduled_at: string;
  status: PostStatus;
  source: "ai" | "week_plan" | "offer" | "manual";
  plan_item_id: string | null;
  brief: Json;
  caption: string | null;
  variants: Json;
  media_id: string | null;
  extra_media: string[];
  regen_count: number;
  deny_reason: string | null;
  safety: Json;
  approved_at: string | null;
  approved_by: string | null;
  /** WhatsApp messages to the owner (0014): picture sent, "published" sent, last alert. */
  wa_media_id: string | null;
  wa_published_at: string | null;
  wa_alert: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicationRow = {
  id: string;
  post_id: string;
  social_account_id: string;
  status: PubStatus;
  attempts: number;
  next_retry_at: string | null;
  container_id: string | null;
  external_id: string | null;
  permalink: string | null;
  error_kind: "temporary" | "needs_user" | "content" | null;
  last_error: string | null;
  published_at: string | null;
  created_at: string;
};

export type UsageRow = {
  business_id: string;
  period: string;
  images: number;
  videos: number;
  ai_videos: number;
  regenerations: number;
  text_calls: number;
  est_cost_usd: number;
};

export type EventRow = {
  id: number;
  business_id: string | null;
  type: string;
  payload: Json;
  notified_via: string[];
  created_at: string;
};

/** A "Continue with Facebook" in progress (0008). */
export type MetaConnectionRow = { id: string; business_id: string; meta_user_id: string; token_secret_id: string | null; created_at: string };

/** Retexia's global switches (0007), read-only for the panel. */
export type SystemSettingsRow = { id: number; generation_paused: boolean; publishing_paused: boolean; note: string | null; updated_at: string; updated_by: string | null };

export type PostDatabase = {
  post: {
    Tables: {
      businesses: Table<BusinessRow, "owner_id" | "name">;
      social_accounts: Table<SocialAccountRow, "business_id" | "platform" | "external_id">;
      products: Table<ProductRow, "business_id" | "name">;
      product_groups: Table<ProductGroupRow, "business_id" | "name">;
      media: Table<MediaRow, "business_id" | "kind" | "source" | "storage_path">;
      plan_items: Table<PlanItemRow, "business_id" | "type" | "start_date" | "end_date">;
      posts: Table<PostRow, "business_id" | "local_date" | "slot" | "format" | "scheduled_at">;
      publications: Table<PublicationRow, "post_id" | "social_account_id">;
      usage_monthly: Table<UsageRow, "business_id" | "period">;
      events: Table<EventRow, "type">;
      system_settings: Table<SystemSettingsRow, never>;
      meta_connections: Table<MetaConnectionRow, "business_id" | "meta_user_id">;
    };
    Views: { [_ in never]: never };
    Functions: {
      bump_usage: { Args: { p_business: string; p_field: string; p_amount?: number; p_cost?: number }; Returns: undefined };
      claim_due_posts: { Args: { p_limit?: number }; Returns: PostRow[] };
      claim_batch_businesses: { Args: Record<string, never>; Returns: { business_id: string; local_date: string }[] };
      save_secret: { Args: { p_secret: string | null; p_value: string }; Returns: string };
      read_secret: { Args: { p_secret: string }; Returns: string | null };
      delete_secret: { Args: { p_secret: string }; Returns: undefined };
      next_free_slot: { Args: { p_business: string }; Returns: { local_date: string; slot: number; scheduled_at: string }[] };
      slot_time: { Args: { p_business: string; p_date: string; p_slot: number }; Returns: string };
      plan_for_owner: { Args: { p_owner: string }; Returns: { plan: PlanTier; subscription_status: BusinessRow["subscription_status"] }[] };
      handle_meta_deletion: { Args: { p_meta_user_id: string }; Returns: string };
      add_planned_items: { Args: { p_business: string; p_date: string; p_items: Json }; Returns: number };
      claim_planning_businesses: { Args: { p_limit?: number }; Returns: { business_id: string; plan_date: string; today: string; plan_today: boolean }[] };
      claim_design_items: { Args: { p_limit?: number }; Returns: PostRow[] };
      design_failed: { Args: { p_post: string; p_error: string }; Returns: undefined };
      item_time: { Args: { p_business: string; p_date: string; p_slot: number; p_story: boolean }; Returns: string };
    };
    Enums: {
      plan_tier: PlanTier;
      platform: Platform;
      post_format: PostFormat;
      post_status: PostStatus;
      pub_status: PubStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

/** businesses.brand */
export type Brand = {
  logo_path?: string | null;
  colors?: string[];
  font?: string | null;
  template?: string | null;
  tone?: { formal_casual?: number; calm_energetic?: number } | string | null;
  emoji?: boolean;
  always_words?: string[];
  never_words?: string[];
  sample_posts?: string[];
  contact?: { phone?: string; website?: string; address?: string; whatsapp?: string; instagram?: string } | null;
};

/** businesses.settings.playlist: how many posts and stories a day, and when they go out. */
/** plan_time: when the next day's playlist is written each day (HH:MM, business time). */
export type Playlist = { posts: number; stories: number; post_times: string[]; story_times: string[]; plan_time: string };

export type WhatsAppType = "items" | "published" | "alerts";

/** businesses.settings */
export type Settings = {
  playlist: Playlist;
  caption_language: CaptionLanguage;
  design_language: DesignLanguage;
  auto_publish: boolean;
  week_plan_enabled: boolean;
  slots: string[];
  content_mix: { photo: number; reel: number };
  stories_per_day: number;
  paused: boolean;
  /** types: items (each post/story with its caption when ready), published, alerts (needs you / failed). */
  whatsapp: { enabled: boolean; number: string | null; opted_in_at: string | null; types: WhatsAppType[]; quiet_hours: [string, string] };
};

/** posts.variants */
export type Variants = {
  facebook?: { caption?: string };
  instagram?: { caption?: string; hashtags?: string[] };
};
