"use client";

import { Tabs, Textarea, useField } from "@retexia/ui";
import { useId, useState } from "react";
import { Markdown } from "./markdown";

/** Markdown textarea with a Write / Preview switch. Use inside <Field>. */
export function MarkdownEditor({
  value,
  onChange,
  rows = 6,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const [tab, setTab] = useState("write");
  const id = useId();
  const field = useField();
  return (
    <div className="flex flex-col gap-2">
      <Tabs
        idPrefix={id}
        label="Editor mode"
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "write", label: "Write" },
          { value: "preview", label: "Preview" },
        ]}
        className="self-start"
      />
      <div id={`${id}-panel-write`} role="tabpanel" aria-labelledby={`${id}-tab-write`} hidden={tab !== "write"}>
        <Textarea
          id={field?.id}
          rows={rows}
          value={value}
          placeholder={placeholder ?? "Markdown: **bold**, [link](/page), lists with -"}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-[13px]"
        />
      </div>
      <div
        id={`${id}-panel-preview`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-preview`}
        hidden={tab !== "preview"}
        className="min-h-24 rounded-md border border-line bg-surface p-4"
      >
        {value.trim() ? <Markdown>{value}</Markdown> : <p className="type-body text-ink-muted">Nothing to preview yet.</p>}
      </div>
    </div>
  );
}
