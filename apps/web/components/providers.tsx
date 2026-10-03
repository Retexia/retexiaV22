"use client";

import { Toaster } from "@retexia/ui";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { StringsProvider } from "@/lib/strings-context";

export function Providers({
  children,
  defaultTheme,
  strings,
}: {
  children: ReactNode;
  defaultTheme: string;
  strings: Record<string, string>;
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme={defaultTheme} enableSystem disableTransitionOnChange>
      <StringsProvider strings={strings}>
        {children}
        <Toaster />
      </StringsProvider>
    </ThemeProvider>
  );
}
