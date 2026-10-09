/** Monthly allowances per plan. Keep in step with apps/panels/lib/post/plans.ts. */
export const POST_PLANS = {
  trial: { label: "Trial", postsPerDay: 2, storiesPerDay: 2, images: 130, videos: 0, regenerations: 30, accounts: 2 },
  starter: { label: "Starter", postsPerDay: 2, storiesPerDay: 2, images: 130, videos: 0, regenerations: 60, accounts: 2 },
  growth: { label: "Growth", postsPerDay: 3, storiesPerDay: 3, images: 200, videos: 0, regenerations: 200, accounts: 4 },
  pro: { label: "Pro", postsPerDay: 5, storiesPerDay: 5, images: 330, videos: 0, regenerations: 500, accounts: 10 },
} as const;
export type PostPlan = keyof typeof POST_PLANS;
export const POST_PLAN_OPTIONS = (Object.keys(POST_PLANS) as PostPlan[]).map((k) => ({ value: k, label: POST_PLANS[k].label }));
export const SUBSCRIPTION_OPTIONS = [
  { value: "trialing", label: "Trial" },
  { value: "active", label: "Active" },
  { value: "past_due", label: "Payment overdue" },
  { value: "canceled", label: "Cancelled (stops posting)" },
];
