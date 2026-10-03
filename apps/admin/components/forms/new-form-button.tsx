"use client";

import { Button, Dialog, Field, Input, Select } from "@retexia/ui";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createForm } from "@/app/(panel)/forms/actions";

export function NewFormButton({ products }: { products: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [productId, setProductId] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button icon={<Plus aria-hidden size={16} strokeWidth={1.5} />} onClick={() => setOpen(true)}>
        New form
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="New form"
        description="Starts with one step asking for name and phone. Attach it to a product from the product's Details tab."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const r = await createForm({ title, productId: productId || null });
                setBusy(false);
                if (!r.ok) return toast.error(r.message);
                router.push(`/forms/${r.data}`);
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Name" required>
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Retexia Post setup" />
          </Field>
          <Field label="For product" optionalLabel="Optional">
            <Select value={productId} onChange={(e) => setProductId(e.target.value)} options={products.map((p) => ({ value: p.id, label: p.name }))} placeholder="None" />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
