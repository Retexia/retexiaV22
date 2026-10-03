"use client";

import { Button } from "@retexia/ui";
import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <Button icon={<Printer aria-hidden size={16} strokeWidth={1.5} />} onClick={() => window.print()}>
      Print or save as PDF
    </Button>
  );
}
