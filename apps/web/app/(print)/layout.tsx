import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Bare layout for printable pages (no header or footer). */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return <main className="min-h-dvh bg-surface-sunk py-8 print:bg-white print:py-0">{children}</main>;
}
