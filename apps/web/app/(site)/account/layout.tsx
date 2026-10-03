import { Container } from "@retexia/ui";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { AccountNav, AccountNavLive } from "@/components/account/account-nav";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <Container className="py-8 md:py-12">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
        <aside className="min-w-0 -mx-gutter border-b border-line bg-surface-sunk px-gutter py-2 md:mx-0 md:self-start md:rounded-lg md:border md:p-3">
          <Suspense fallback={<AccountNav pathname="" />}>
            <AccountNavLive />
          </Suspense>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  );
}
