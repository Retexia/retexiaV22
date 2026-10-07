"use client";

import { Button, Dialog } from "@retexia/ui";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NewLingoAccountForm } from "./account-form";

export function NewLingoAccountButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" icon={<Plus aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setOpen(true)}>
        New bot account
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="New bot account" description="Connect it to a customer afterwards, or create it from their request to connect it straight away." size="lg">
        <NewLingoAccountForm onCancel={() => setOpen(false)} onDone={(id) => router.push(`/products/lingo/accounts/${id}`)} />
      </Dialog>
    </>
  );
}
