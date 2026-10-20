import type { ReactNode } from "react";
import { FeederShell } from "@/components/feeder/feeder-shell";
import { webUrl } from "@/lib/env";
import { requireFeederPage } from "@/lib/feeder/access";

export default async function FeederLayout({ children }: { children: ReactNode }) {
  const { user, packages } = await requireFeederPage();
  return (
    <FeederShell packages={packages.map((p) => ({ slug: p.slug, name: p.name, owned: p.owned }))} webUrl={webUrl()} email={user.email}>
      {children}
    </FeederShell>
  );
}
