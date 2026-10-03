"use client";

import { Badge, Button, Card, formatDate } from "@retexia/ui";
import { Archive, Check, Mail, MessageCircle, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { deleteMessage, setMessageStatus } from "@/app/(panel)/inbox/actions";

export type Message = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  business_name: string | null;
  subject: string | null;
  message: string;
  status: string;
  source_path: string | null;
  created_at: string;
  product: string | null;
  customerId: string | null;
};

export function MessagePanel({ message, canOperate, canDelete }: { message: Message; canOperate: boolean; canDelete: boolean }) {
  const router = useRouter();
  const marked = useRef(false);
  // Opening a new message marks it as read.
  useEffect(() => {
    if (marked.current || !canOperate || message.status !== "new") return;
    marked.current = true;
    void setMessageStatus({ id: message.id, status: "read" }).then(() => router.refresh());
  }, [message.id, message.status, canOperate, router]);

  const set = async (status: "replied" | "archived" | "new") => {
    const r = await setMessageStatus({ id: message.id, status });
    toast[r.ok ? "success" : "error"](r.message ?? "");
    router.refresh();
  };
  const phone = (message.phone ?? "").replace(/[^\d]/g, "");
  const subject = encodeURIComponent(`Re: ${message.subject || "your message to Retexia"}`);

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <h2 className="type-h2 text-ink">{message.name}</h2>
          <Badge tone={message.status === "new" ? "brand" : message.status === "replied" ? "success" : "neutral"}>{message.status}</Badge>
          {message.product ? <Badge>{message.product}</Badge> : null}
        </span>
        <span className="type-small text-ink-muted">
          {[message.business_name, message.email, message.phone].filter(Boolean).join(" · ")}
        </span>
        <span className="type-small text-ink-muted">
          {formatDate(message.created_at, "en-LK", true)}
          {message.source_path ? ` · from ${message.source_path}` : ""}
        </span>
      </div>
      {message.subject ? <p className="type-label text-ink">{message.subject}</p> : null}
      <p className="type-body-lg whitespace-pre-line text-ink">{message.message}</p>
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button href={`mailto:${message.email}?subject=${subject}`} icon={<Mail aria-hidden size={16} strokeWidth={1.5} />}>
          Reply by email
        </Button>
        {phone ? (
          <Button href={`https://wa.me/${phone}?text=${encodeURIComponent(`Hi ${message.name}, thanks for your message to Retexia.`)}`} variant="secondary" icon={<MessageCircle aria-hidden size={16} strokeWidth={1.5} />}>
            WhatsApp
          </Button>
        ) : null}
        {canOperate && message.status !== "replied" ? (
          <Button variant="secondary" icon={<Check aria-hidden size={16} strokeWidth={1.5} />} onClick={() => set("replied")}>
            Mark as replied
          </Button>
        ) : null}
        {canOperate && message.status !== "archived" ? (
          <Button variant="ghost" icon={<Archive aria-hidden size={16} strokeWidth={1.5} />} onClick={() => set("archived")}>
            Archive
          </Button>
        ) : null}
        {canOperate && message.status !== "new" ? (
          <Button variant="ghost" onClick={() => set("new")}>
            Mark as unread
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {message.customerId ? (
          <>
            <Button href={`/customers/${message.customerId}`} variant="ghost" size="sm" icon={<UserRound aria-hidden size={14} strokeWidth={1.5} />}>
              Open customer
            </Button>
            {canOperate ? (
              <Button href={`/requests/new?customer=${message.customerId}`} variant="ghost" size="sm">
                Convert to request
              </Button>
            ) : null}
          </>
        ) : (
          <p className="type-small text-ink-muted">
            No account matches this email. Invite them from{" "}
            <Link href="/requests/new" className="text-link">
              New request
            </Link>{" "}
            to create a request for them.
          </p>
        )}
        {canDelete ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-danger!"
            icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />}
            onClick={async () => {
              if (!window.confirm("Delete this message for good?")) return;
              const r = await deleteMessage({ id: message.id });
              toast[r.ok ? "success" : "error"](r.message ?? "");
              router.push("/inbox");
            }}
          >
            Delete
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

export function CopyEmails({ emails }: { emails: string[] }) {
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={!emails.length}
      onClick={async () => {
        await navigator.clipboard.writeText(emails.join(", "));
        toast.success(`${emails.length} email${emails.length === 1 ? "" : "s"} copied`);
      }}
    >
      Copy emails
    </Button>
  );
}
