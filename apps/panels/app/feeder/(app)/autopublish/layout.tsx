import { Badge } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import type { ReactNode } from "react";
import { AutopublishNav } from "@/components/feeder/autopublish/nav";
import { listLaunches, requireAutopublishPage } from "@/lib/feeder/autopublish/data";

/** feeder.retexia.com/autopublish: launch ads for a Feeder product on Meta and TikTok (free). */
export default async function AutopublishLayout({ children }: { children: ReactNode }) {
  const { user } = await requireAutopublishPage();
  const launches = await listLaunches(user.id, 100).catch(() => []);
  const attention = launches.filter((l) => ["needs_attention", "partly_live", "blocked", "failed", "awaiting_approval"].includes(l.state)).length;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Autopublish"
        chips={<Badge tone="success">Free</Badge>}
        description="Drop your videos or images, pick a product and a template, check the preview and launch on Facebook, Instagram and TikTok. Everything is named after your product's form name, so Bulk create matches every lead."
      />
      <AutopublishNav attention={attention} />
      {children}
    </div>
  );
}
