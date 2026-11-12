"use client";

import { Button, DropdownMenu } from "@retexia/ui";
import { CheckCircle2, MoreHorizontal, Pencil, RotateCcw, Trash2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteGoal, setGoalStatus } from "@/app/plan/actions";
import type { Goal } from "@/lib/plan/logic";
import { GoalDialog } from "./goal-dialog";

/** The owner's goal menu: edit, done, drop, delete. */
export function GoalActions({ goal, parents, today }: { goal: Goal; parents: Pick<Goal, "id" | "title" | "period" | "starts_on" | "ends_on">[]; today: string }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const status = async (s: Goal["status"]) => {
    const r = await setGoalStatus({ id: goal.id, status: s });
    toast[r.ok ? "success" : "error"](r.message ?? "");
    router.refresh();
  };
  return (
    <>
      <div className="flex gap-2">
        {goal.status === "active" ? (
          <Button variant="secondary" icon={<CheckCircle2 aria-hidden size={16} strokeWidth={1.5} />} onClick={() => status("done")}>
            Mark as done
          </Button>
        ) : (
          <Button variant="secondary" icon={<RotateCcw aria-hidden size={16} strokeWidth={1.5} />} onClick={() => status("active")}>
            Make active again
          </Button>
        )}
        <DropdownMenu
          align="end"
          triggerLabel="Goal options"
          triggerClassName="inline-flex size-10 items-center justify-center rounded-full border border-line text-ink hover:bg-surface-sunk focus-visible:focus-ring"
          trigger={<MoreHorizontal aria-hidden size={18} strokeWidth={1.5} />}
          items={[
            { type: "button", label: "Edit goal", icon: <Pencil aria-hidden size={14} strokeWidth={1.5} />, onSelect: () => setEdit(true) },
            ...(goal.status === "active" ? [{ type: "button" as const, label: "Drop this goal", icon: <XCircle aria-hidden size={14} strokeWidth={1.5} />, onSelect: () => status("dropped") }] : []),
            {
              type: "button",
              label: "Delete goal",
              danger: true,
              icon: <Trash2 aria-hidden size={14} strokeWidth={1.5} />,
              onSelect: async () => {
                if (!window.confirm(`Delete "${goal.title}" with its charts, values and chat? This can't be undone.`)) return;
                const r = await deleteGoal({ id: goal.id });
                toast[r.ok ? "success" : "error"](r.message ?? "");
                if (r.ok) router.push("/goals");
              },
            },
          ]}
        />
      </div>
      {edit ? <GoalDialog open onClose={() => setEdit(false)} goal={goal} parents={parents} today={today} /> : null}
    </>
  );
}
