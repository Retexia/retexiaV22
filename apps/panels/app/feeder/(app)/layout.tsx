import type { ReactNode } from "react";
import { FeederShell } from "@/components/feeder/feeder-shell";
import { webUrl } from "@/lib/env";
import { requireFeederPage } from "@/lib/feeder/access";

/** Whole days left in a free trial (at least 1 while it runs). */
const daysLeft = (endsAt: string) => Math.max(1, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000));

export default async function FeederLayout({ children }: { children: ReactNode }) {
  const { user, packages } = await requireFeederPage();
  // Only on a free trial (no paid package): "Free trial · N days left · Upgrade".
  const trial = packages.some((p) => p.owned && !p.trialEndsAt) ? null : packages.find((p) => p.owned && p.trialEndsAt);
  return (
    <FeederShell
      packages={packages.map((p) => ({ slug: p.slug, name: p.name, owned: p.owned }))}
      webUrl={webUrl()}
      email={user.email}
      trial={trial ? { daysLeft: daysLeft(trial.trialEndsAt!), payUrl: `${webUrl()}/account/products/${encodeURIComponent(trial.orderRef ?? "")}` } : null}
    >
      {children}
    </FeederShell>
  );
}
