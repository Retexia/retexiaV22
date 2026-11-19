// Retexia Feeder → Autopublish: the plan compiler (apps/panels/lib/feeder/autopublish/plan.ts).
// Every preset with 3 creatives and 2 audiences, budgets, TikTok rules, approvals.
//
//   pnpm db:test   (or: node scripts/test-autopublish.mjs)
import { applyOverrides, applyPreset, compile, defaultAudience, defaultTemplate, readTemplate, sampleSummaries, skippedKeys } from "../apps/panels/lib/feeder/autopublish/plan.ts";

let passed = 0;
let failed = 0;
const ok = (cond, name) => {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`);
  }
};

const three = [1, 2, 3].map((position) => ({ position, kind: "video", name: `Video ${position}` }));
const product = { name: "Wart Remover", form_name: "Wartosin 1490" };
const base = () => {
  const t = defaultTemplate();
  t.audiences = [defaultAudience(), { ...defaultAudience(), name: "Colombo · women", mode: "manual", age_min: 25, age_max: 45, genders: "female" }];
  return t;
};
const withPreset = (key, edit) => {
  const t = base();
  t.structure = applyPreset(t.structure, key);
  t.structure.budget.amount = 6000;
  t.structure.budget.adset_amount = 2000;
  edit?.(t);
  return t;
};
const run = (t, creatives = three, currency = "LKR") => compile({ template: t, creatives, product, currency, date: "2026-11-19" });
const count = (r, platform = "meta") => {
  const n = (level) => r.nodes.filter((x) => x.platform === platform && x.level === level).length;
  return `${n("campaign")}/${n("adset")}/${n("ad")}`;
};

console.log("Autopublish: every layout with 3 creatives and 2 audiences (Part D 2a)");
{
  const single = run(withPreset("single"));
  ok(single.errors.some((e) => e.field === "creatives" && /exactly 1/.test(e.message)), "Single ad refuses 3 creatives with a clear message");
  ok(run(withPreset("single"), three.slice(0, 1)).errors.length === 0 && count(run(withPreset("single"), three.slice(0, 1))) === "1/1/1", "Single ad with one creative: 1 campaign · 1 ad set · 1 ad");
  ok(count(run(withPreset("campaign_per_creative"))) === "3/3/3", "Campaign per creative: 3/3/3");
  ok(count(run(withPreset("one_adset_many_ads"))) === "1/1/3", "One ad set, many ads: 1/1/3");
  ok(count(run(withPreset("adset_per_creative"))) === "1/3/3", "Ad set per creative: 1/3/3");
  ok(count(run(withPreset("adset_per_audience"))) === "1/2/6", "Ad set per audience: 1/2/6");
  ok(count(run(withPreset("matrix"))) === "1/6/6", "Audience × creative: 1/6/6");
  const evergreen = run(withPreset("evergreen"));
  ok(count(evergreen) === "1/1/3" && evergreen.nodes.find((n) => n.key === "c1").action === "slot", "Evergreen: the kept campaign (slot) + 1 new ad set + 3 ads");
  const existingC = run(withPreset("existing_campaign", (t) => (t.structure.campaign.existing_id.meta = "120200000000001")));
  ok(existingC.errors.length === 0 && existingC.nodes.find((n) => n.key === "c1").action === "reuse" && count(existingC) === "1/1/3", "Add ad sets to an existing campaign: reused campaign, new ad set");
  ok(existingC.nodes.every((n) => n.level !== "campaign" || (n.budget_daily == null && n.budget_lifetime == null)), "an existing campaign is never given a budget");
  const existingS = run(withPreset("existing_adset", (t) => (t.structure.adsets.existing_id.meta = "120200000000002")));
  ok(existingS.errors.length === 0 && existingS.nodes.filter((n) => n.level === "adset").every((n) => n.action === "reuse") && existingS.nodes.filter((n) => n.level === "ad").length === 3, "Add ads to an existing ad set: the ad set is reused, 3 new ads");
  ok(run(withPreset("existing_adset")).errors.some((e) => /ad set ID/.test(e.message)), "an existing ad set needs its ID");
}

console.log("Autopublish: media once, keys, names (2g)");
{
  const r = run(withPreset("matrix"));
  ok(r.nodes.filter((n) => n.level === "media").length === 3, "the same creative in 2 ad sets is uploaded once per platform");
  ok(r.nodes.filter((n) => n.level === "creative").length === 3, "one Meta creative per file, shared by its ads");
  const keys = r.nodes.map((n) => n.key);
  ok(new Set(keys).size === keys.length && keys.every((k) => /^[a-z0-9.]{1,40}$/.test(k)), "keys are unique and stable (m1, f1, c1, c1.s2, k3, c1.s2.a3)");
  ok(JSON.stringify(run(withPreset("matrix")).nodes) === JSON.stringify(r.nodes), "compiling again gives the same tree (retries never duplicate)");
  ok(r.nodes.find((n) => n.level === "form").name === "Wartosin 1490", "the lead form is named exactly after the product's form name");
  ok(r.nodes.filter((n) => n.level !== "media").every((n) => n.name.startsWith("Wartosin 1490")), "campaigns, ad sets and ads start with the form name");
  const ad = r.nodes.find((n) => n.key === "c1.s1.a1");
  ok(ad.depends_on.includes("c1.s1") && ad.depends_on.includes("k1"), "a Meta ad waits for its ad set and its creative");
  ok(r.nodes.find((n) => n.key === "k1").depends_on.join() === "m1,f1", "a Meta creative waits for its upload and the form");
}

console.log("Autopublish: budgets (2c)");
{
  const divide = run(withPreset("adset_per_creative", (t) => (t.structure.budget.adset_split = "divide")));
  ok(divide.nodes.filter((n) => n.level === "adset").every((n) => n.budget_daily === 2000) && divide.platforms[0].daily === 6000, "LKR 6,000 shared by 3 ad sets → 2,000 each, 6,000 a day in total");
  const fixed = run(withPreset("adset_per_creative"));
  ok(fixed.nodes.filter((n) => n.level === "adset").every((n) => n.budget_daily === 2000) && fixed.nodes.find((n) => n.level === "campaign").budget_daily == null, "ad set budgets: the campaign has none");
  const low = run(withPreset("adset_per_creative", (t) => (t.structure.budget.adset_amount = 50)));
  ok(low.errors.some((e) => e.field === "budget" && /at least about LKR/.test(e.message)), "below the platform minimum → a clear error before anything is made");
  ok(run(withPreset("one_adset_many_ads")).summary === "Meta: 1 campaign · 1 ad set · 3 ads · LKR 6,000/day", "summary: Meta: 1 campaign · 1 ad set · 3 ads · LKR 6,000/day");
  const thin = run(withPreset("matrix", (t) => (t.target_cost_per_result = 300)));
  ok(thin.warnings.some((w) => /learning phase/.test(w.message)) && thin.errors.length === 0, "a thin budget per ad set is a warning, not a block");
  const life = withPreset("one_adset_many_ads", (t) => (t.structure.budget.type = "lifetime"));
  ok(run(life).errors.some((e) => e.field === "schedule.duration_days"), "a lifetime budget needs a number of days");
  life.schedule.duration_days = 10;
  life.structure.budget.amount = 30000;
  ok(run(life).platforms[0].daily === 3000, "lifetime LKR 30,000 over 10 days counts as 3,000 a day");
}

console.log("Autopublish: TikTok (2b, 4)");
{
  const t = withPreset("one_adset_many_ads", (x) => {
    x.platforms = ["meta", "tiktok"];
    x.structure.tiktok_budget.amount = 16000;
  });
  const mixed = [...three.slice(0, 2), { position: 3, kind: "image", name: "Photo" }];
  const r = run(t, mixed);
  ok(count(r, "meta") === "1/1/3" && count(r, "tiktok") === "1/1/2", "an image goes to Meta only; TikTok gets the 2 videos");
  ok(r.warnings.some((w) => w.platform === "tiktok" && /videos only/.test(w.message)), "…with a warning");
  ok(r.nodes.filter((n) => n.platform === "tiktok" && n.level === "creative").length === 0, "TikTok has no separate creative step");
  ok(r.platforms.find((p) => p.platform === "tiktok").daily === 16000, "TikTok can have its own budget");
  t.image_on_tiktok = "reject";
  ok(run(t, mixed).errors.some((e) => e.platform === "tiktok"), "or images are refused for TikTok when the template says so");
  t.structure.tiktok_budget.amount = 3000;
  t.image_on_tiktok = "skip_tiktok";
  ok(run(t, mixed).errors.some((e) => e.platform === "tiktok" && /TikTok needs at least/.test(e.message)), "TikTok's higher minimum budget is checked");
  const images = run(t, [{ position: 1, kind: "image", name: "Photo" }]);
  ok(images.platforms.find((p) => p.platform === "tiktok").skipped === "no videos" && !images.nodes.some((n) => n.platform === "tiktok"), "only images → nothing on TikTok");
  const msg = withPreset("one_adset_many_ads", (x) => {
    x.platforms = ["meta", "tiktok"];
    x.objective = "messages";
  });
  ok(run(msg).errors.some((e) => e.field === "objective"), "Messages is Meta only for now (clear message)");
  const long = withPreset("one_adset_many_ads", (x) => {
    x.platforms = ["tiktok"];
    x.copy.tiktok_text = "x".repeat(140);
    x.structure.budget.amount = 16000;
  });
  ok(run(long).errors.some((e) => e.field === "copy.tiktok_text"), "TikTok ad text over 100 characters is refused");
}

console.log("Autopublish: AI audience (16)");
{
  const t = withPreset("one_adset_many_ads", (x) => (x.audiences = [{ ...defaultAudience(), age_min: 30, suggest_age: [30, 50] }]));
  ok(run(t).errors.some((e) => /18–25/.test(e.message)), "Meta AI audience: minimum age above 25 is refused, with the way out");
  t.audiences[0].age_min = 18;
  ok(run(t).errors.length === 0, "minimum 18 + preferred 30–50 is fine");
  t.audiences[0].genders = "female";
  ok(run(t).warnings.some((w) => /only a suggestion/.test(w.message)), "a gender in AI mode is explained as a suggestion");
  const split = withPreset("adset_per_audience", (x) => (x.audiences = [defaultAudience()]));
  ok(run(split).errors.some((e) => /at least 2 audiences/.test(e.message)), "an ad set per audience needs 2 audiences");
}

console.log("Autopublish: launch changes and approvals (2e, 2f, 13)");
{
  const t = withPreset("one_adset_many_ads");
  const up = applyOverrides(t, { budget: 20000 });
  ok(up.template.structure.budget.amount === 9000 && up.warnings.some((w) => /at most 50%/.test(w.message)), "a launch can raise the budget only up to the template's limit");
  ok(applyOverrides(t, { budget: 4000 }).template.structure.budget.amount === 4000, "lower is always fine");
  t.overridable = ["copy"];
  const no = applyOverrides(t, { budget: 4000, copy: { headline: "New" } });
  ok(no.template.structure.budget.amount === 6000 && no.template.copy.headline === "New" && no.warnings.some((w) => w.field === "budget"), "changes the template doesn't allow are ignored, with a warning");
  ok(t.structure.budget.amount === 6000, "the template itself is never changed");
  const r = run(withPreset("matrix"));
  const skip = skippedKeys(r.nodes, [1, 3]);
  const kept = r.nodes.filter((n) => !skip.has(`${n.platform}:${n.key}`));
  ok(kept.filter((n) => n.level === "ad").length === 4 && kept.filter((n) => n.level === "adset").length === 4 && !kept.some((n) => n.key === "m2"), "approving #1 and #3 skips every node built only from #2, empty ad sets too");
  ok(!skip.has("meta:c1") && !skip.has("meta:f1"), "the campaign and form stay");
}

console.log("Autopublish: stored templates");
{
  const t = readTemplate({ name: "x", platforms: ["meta", "nope"], objective: "leads", structure: { preset: "matrix", budget: { amount: "6000" } }, audiences: [{ name: "A", interests: [{ id: "6003107902433", name: "Home" }, { id: "abc", name: "bad" }] }] });
  ok(t.platforms.join() === "meta" && t.structure.budget.amount === 6000 && t.audiences[0].interests.length === 1, "stored JSON is read safely (unknown values dropped, numbers parsed)");
  const s = sampleSummaries(withPreset("adset_per_creative"), "LKR");
  ok(s.length === 3 && s[2].summary.startsWith("Meta: 1 campaign · 10 ad sets · 10 ads"), "the editor shows what 1, 3 and 10 creatives make");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
