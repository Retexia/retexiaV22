"use client";

import { Button } from "@retexia/ui";
import { Printer } from "lucide-react";

export function PrintButton({ label }: { label: string }) {
  return (
    <Button icon={<Printer aria-hidden size={16} strokeWidth={1.5} />} onClick={() => window.print()}>
      {label}
    </Button>
  );
}
