"use client";

import { Button, Field, Input, Textarea } from "@retexia/ui";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { submitPaymentProof } from "@/app/(site)/account/actions";
import { useT } from "@/lib/strings-context";

const ACCEPT = "image/png,image/jpeg,image/webp,image/heic,application/pdf";
const MAX = 5 * 1024 * 1024;

/** Upload a bank slip or transfer screenshot while a request is awaiting payment. */
export function PaymentProofForm({ orderId, orderRef }: { orderId: string; orderRef: string }) {
  const t = useT();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState(orderRef);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError(t("order.proof.choose", "Choose a photo or PDF of your payment slip."));
    if (!ACCEPT.split(",").includes(file.type)) return setError(t("order.proof.type", "Upload a photo (JPG, PNG, WebP, HEIC) or a PDF."));
    if (file.size > MAX) return setError(t("order.proof.size", "The file must be 5 MB or smaller."));
    setError(null);
    setPending(true);
    const fd = new FormData();
    fd.set("orderId", orderId);
    fd.set("file", file);
    fd.set("reference", reference);
    fd.set("note", note);
    const result = await submitPaymentProof(fd);
    setPending(false);
    if (!result.ok) return setError(result.message);
    toast.success(result.message);
    setFile(null);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label={t("order.proof.file", "Payment slip or screenshot")} hint={t("order.proof.hint", "JPG, PNG, WebP, HEIC or PDF, up to 5 MB.")} error={error} required labelAs="legend">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(null);
            }}
          />
          <Button type="button" variant="secondary" icon={<Upload aria-hidden size={16} strokeWidth={1.5} />} onClick={() => fileRef.current?.click()}>
            {file ? t("order.proof.change", "Choose another file") : t("order.proof.pick", "Choose file")}
          </Button>
          <span className="min-w-0 truncate type-small text-ink-muted" aria-live="polite">
            {file ? `${file.name} · ${Math.round(file.size / 1024)} KB` : t("order.proof.none", "No file chosen")}
          </span>
        </div>
      </Field>
      <Field label={t("order.proof.reference", "Payment reference")} optionalLabel={t("form.optional", "Optional")}>
        <Input value={reference} maxLength={200} onChange={(e) => setReference(e.target.value)} />
      </Field>
      <Field label={t("order.proof.note", "Note for us")} optionalLabel={t("form.optional", "Optional")}>
        <Textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button type="submit" loading={pending} className="self-start">
        {t("order.proof.submit", "Send payment proof")}
      </Button>
    </form>
  );
}
