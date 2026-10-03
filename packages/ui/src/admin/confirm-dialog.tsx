"use client";

import { useState, type ReactNode } from "react";
import { Button } from "../components/button";
import { Field, Input } from "../components/form-controls";
import { Dialog } from "../components/interactive";

/**
 * Confirmation for dangerous actions. With `confirmText`, the person must type
 * it (e.g. the request ref or product name) before the button unlocks.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmText,
  danger = true,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  /** Text the person must type to confirm. */
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  children?: ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const locked = Boolean(confirmText) && typed.trim() !== confirmText;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTyped("");
        onOpenChange(next);
      }}
      size="sm"
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            disabled={locked}
            loading={pending}
            onClick={async () => {
              setPending(true);
              try {
                await onConfirm();
              } finally {
                setPending(false);
                setTyped("");
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {children}
        {confirmText ? (
          <Field
            label={
              <>
                Type <span className="font-mono text-ink">{confirmText}</span> to confirm
              </>
            }
            required
          >
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
        ) : null}
      </div>
    </Dialog>
  );
}
