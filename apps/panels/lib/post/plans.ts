import type { PlanTier } from "./post-db.types";

/**
 * What each plan includes (limits live in code, not the database).
 * postsPerDay / storiesPerDay: the most items one day's playlist can hold.
 * images: AI designs a month (a full playlist every day fits, plus some extras).
 */
export const PLAN_LIMITS: Record<
  PlanTier,
  { label: string; postsPerDay: number; storiesPerDay: number; images: number; videos: number; ai_videos: number; regenerations: number; accounts: number; storageGb: number; weekPlan: boolean }
> = {
  trial: { label: "Trial", postsPerDay: 2, storiesPerDay: 2, images: 130, videos: 0, ai_videos: 0, regenerations: 30, accounts: 2, storageGb: 1, weekPlan: true },
  starter: { label: "Starter", postsPerDay: 2, storiesPerDay: 2, images: 130, videos: 0, ai_videos: 0, regenerations: 60, accounts: 2, storageGb: 1, weekPlan: false },
  growth: { label: "Growth", postsPerDay: 3, storiesPerDay: 3, images: 200, videos: 0, ai_videos: 0, regenerations: 200, accounts: 4, storageGb: 5, weekPlan: true },
  pro: { label: "Pro", postsPerDay: 5, storiesPerDay: 5, images: 330, videos: 0, ai_videos: 0, regenerations: 500, accounts: 10, storageGb: 20, weekPlan: true },
};

/** Default publish times for n items a day (same as post.default_times in the database). */
export function defaultTimes(count: number, story: boolean): string[] {
  const posts = [["12:00"], ["09:00", "18:00"], ["09:00", "13:00", "19:00"], ["08:00", "12:00", "16:00", "20:00"], ["08:00", "11:00", "14:00", "17:00", "20:00"]];
  const stories = [["10:00"], ["10:00", "20:30"], ["10:00", "15:00", "20:30"], ["09:30", "13:00", "16:30", "20:30"], ["09:30", "12:30", "15:30", "18:30", "21:30"]];
  if (count <= 0) return [];
  return (story ? stories : posts)[Math.min(5, count) - 1]!;
}
