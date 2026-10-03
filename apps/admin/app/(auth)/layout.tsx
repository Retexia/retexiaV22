import { Logo, ThemeToggle } from "@retexia/ui";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface-sunk">
      <header className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <Logo name="Retexia" href={null} />
          <span className="rounded-sm bg-brand-soft px-1.5 py-0.5 type-caption text-brand">Admin</span>
        </div>
        <ThemeToggle />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-6 pt-6 pb-16 md:items-center md:pt-0">
        <div className="w-full max-w-[420px]">{children}</div>
      </main>
    </div>
  );
}
