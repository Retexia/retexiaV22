"use client";

import { Button, type ButtonVariant } from "@retexia/ui";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { Goal, Period } from "@/lib/plan/logic";
import { GoalDialog } from "./goal-dialog";

export function NewGoalButton({
  parents,
  today,
  defaults,
  label = "New goal",
  variant = "primary",
}: {
  parents: Pick<Goal, "id" | "title" | "period" | "starts_on" | "ends_on">[];
  today: string;
  defaults?: { period?: Period; parent_id?: string };
  label?: string;
  variant?: ButtonVariant;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} icon={<Plus aria-hidden size={16} strokeWidth={1.5} />} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? <GoalDialog open onClose={() => setOpen(false)} parents={parents} today={today} defaults={defaults} /> : null}
    </>
  );
}
