"use client";

import { ProgressLine, Toaster } from "@retexia/ui";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} themes={["light", "dark"]} disableTransitionOnChange>
      {children}
      <Toaster />
      <ProgressLine />
    </ThemeProvider>
  );
}
