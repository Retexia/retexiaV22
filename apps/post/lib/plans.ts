import type { PlanTier } from "./post-db.types";

/** Monthly allowances per plan (from the product spec; limits live in code, not the database). */
export const PLAN_LIMITS: Record<PlanTier, { label: string; images: number; videos: number; ai_videos: number; regenerations: number; accounts: number; storageGb: number; weekPlan: boolean }> = {
  trial: { label: "Trial", images: 20, videos: 2, ai_videos: 0, regenerations: 30, accounts: 2, storageGb: 1, weekPlan: true },
  starter: { label: "Starter", images: 40, videos: 4, ai_videos: 0, regenerations: 60, accounts: 2, storageGb: 1, weekPlan: false },
  growth: { label: "Growth", images: 150, videos: 30, ai_videos: 0, regenerations: 200, accounts: 4, storageGb: 5, weekPlan: true },
  pro: { label: "Pro", images: 400, videos: 90, ai_videos: 20, regenerations: 500, accounts: 10, storageGb: 20, weekPlan: true },
};
