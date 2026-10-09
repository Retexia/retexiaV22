"use client";

import { Button } from "@retexia/ui";
import { Plus } from "lucide-react";
import { useState } from "react";
import { ItemDialog } from "./item-dialogs";

/** "+ Add post" / "+ Add story" for a day's playlist (up to the plan's limit). */
export function AddItem({ date, format, used, max, defaultTime, defaults }: { date: string; format: "post" | "story"; used: number; max: number; defaultTime: string; defaults: { caption: string; design: string } }) {
  const [open, setOpen] = useState(false);
  const full = used >= max;
  return (
    <>
      <Button size="sm" variant="secondary" disabled={full} title={full ? `Your plan allows ${max} a day` : undefined} icon={<Plus aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setOpen(true)}>
        Add {format}
      </Button>
      {open ? (
        <ItemDialog
          open
          onOpenChange={setOpen}
          create={{ date, format }}
          initial={{ title: "", prompt: "", time: defaultTime, caption_language: defaults.caption, design_language: defaults.design }}
        />
      ) : null}
    </>
  );
}
