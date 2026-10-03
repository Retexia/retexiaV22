"use client";

import { roleLabels, STAFF_ROLES, type Role } from "@retexia/supabase";
import { Alert, Button, Card, Checkbox, Field, Input, Select, formatDate } from "@retexia/ui";
import { ConfirmDialog } from "@retexia/ui/admin";
import { Pin, PinOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  addCustomerNote,
  changeCustomerEmail,
  customerAccountAction,
  deleteCustomer,
  updateCustomer,
  updateCustomerNote,
} from "@/app/(panel)/customers/actions";
import { setStaffRole } from "@/app/(panel)/settings/team/actions";
import { Markdown } from "@/components/common/markdown";
import { MarkdownEditor } from "@/components/common/markdown-editor";

export type CustomerProfile = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  whatsapp: string;
  business_name: string;
  marketing_opt_in: boolean;
  role: Role;
  is_banned: boolean;
  email_confirmed: boolean;
};

export function ProfileCard({ profile, canEdit }: { profile: CustomerProfile; canEdit: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState(profile);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(profile);
  return (
    <Card className="flex flex-col gap-5">
      <h2 className="type-h2 text-ink">Profile</h2>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <form
        method="post"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError(null);
          const r = await updateCustomer(form);
          setPending(false);
          if (r.ok) {
            toast.success(r.message ?? "Saved");
            router.refresh();
          } else setError(r.message);
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field label="Full name" required className="sm:col-span-2">
          <Input value={form.full_name} disabled={!canEdit} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>
        <Field label="Phone" optionalLabel="Optional">
          <Input type="tel" value={form.phone} disabled={!canEdit} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="WhatsApp" optionalLabel="Optional">
          <Input type="tel" value={form.whatsapp} disabled={!canEdit} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
        </Field>
        <Field label="Business name" optionalLabel="Optional" className="sm:col-span-2">
          <Input value={form.business_name} disabled={!canEdit} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Checkbox label="Wants product news by email" checked={form.marketing_opt_in} disabled={!canEdit} onChange={(e) => setForm({ ...form, marketing_opt_in: e.target.checked })} />
        </div>
        {canEdit ? (
          <div className="flex justify-end gap-2 border-t border-line pt-4 sm:col-span-2">
            <Button variant="ghost" disabled={!dirty} onClick={() => setForm(profile)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} disabled={!dirty}>
              Save
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  );
}

export function AccountActions({ profile, canManage, isOwner, isSelf }: { profile: CustomerProfile; canManage: boolean; isOwner: boolean; isSelf: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState(profile.email);
  const [role, setRole] = useState<Role>(profile.role);
  const [banOpen, setBanOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    const r = await fn();
    toast[r.ok ? "success" : "error"](r.message ?? "");
    router.refresh();
    return r;
  };
  if (!canManage) {
    return (
      <Card className="flex flex-col gap-2">
        <h2 className="type-h2 text-ink">Account</h2>
        <p className="type-body text-ink-muted">Only admins can change logins.</p>
      </Card>
    );
  }
  return (
    <Card className="flex flex-col gap-5">
      <h2 className="type-h2 text-ink">Account</h2>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => run(() => customerAccountAction({ id: profile.id, action: "reset_link" }))}>
          Send password reset link
        </Button>
        {!profile.email_confirmed ? (
          <Button size="sm" variant="secondary" onClick={() => run(() => customerAccountAction({ id: profile.id, action: "resend_confirmation" }))}>
            Resend confirmation
          </Button>
        ) : null}
        {!isSelf ? (
          profile.is_banned ? (
            <Button size="sm" variant="secondary" onClick={() => run(() => customerAccountAction({ id: profile.id, action: "unban" }))}>
              Unban
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="text-danger!" onClick={() => setBanOpen(true)}>
              Ban
            </Button>
          )
        ) : null}
      </div>
      <form
        method="post"
        onSubmit={async (e) => {
          e.preventDefault();
          await run(() => changeCustomerEmail({ id: profile.id, email }));
        }}
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <Field label="Login email" hint="Changed right away, without a confirmation email." className="flex-1">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Button type="submit" variant="secondary" disabled={email === profile.email}>
          Change email
        </Button>
      </form>
      {isOwner && !isSelf ? (
        <div className="flex flex-col gap-4 border-t border-line pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Role" hint="Staff roles open the admin panel." className="flex-1">
              <Select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                options={(["customer", ...STAFF_ROLES] as Role[]).map((r) => ({ value: r, label: roleLabels[r] }))}
              />
            </Field>
            <Button variant="secondary" disabled={role === profile.role} onClick={() => run(() => setStaffRole({ userId: profile.id, role }))}>
              Change role
            </Button>
          </div>
          <Button variant="danger" size="sm" className="self-start" onClick={() => setDeleteOpen(true)}>
            Delete customer
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={banOpen}
        onOpenChange={setBanOpen}
        title="Ban this account?"
        description="They are signed out and can't sign in until you unban them. Their requests stay as they are."
        confirmLabel="Ban account"
        onConfirm={async () => {
          await run(() => customerAccountAction({ id: profile.id, action: "ban" }));
          setBanOpen(false);
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this customer?"
        description="Their login is removed and personal details (name, phone, contact answers, messages, waitlist) are anonymised. Requests and payments are kept for accounting, without their name. This can't be undone."
        confirmLabel="Delete customer"
        confirmText={profile.email || "DELETE"}
        onConfirm={async () => {
          const r = await deleteCustomer({ id: profile.id });
          toast[r.ok ? "success" : "error"](r.message ?? "");
          setDeleteOpen(false);
          if (r.ok) router.push("/customers");
        }}
      />
    </Card>
  );
}

export type CustomerNote = { id: string; body: string; pinned: boolean; created_at: string; author: string | null; canEdit: boolean };

export function CustomerNotes({ userId, notes, canOperate }: { userId: string; notes: CustomerNote[]; canOperate: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card className="flex flex-col gap-4">
        {notes.length ? (
          <ul className="flex flex-col divide-y divide-line">
            {[...notes]
              .sort((a, b) => Number(b.pinned) - Number(a.pinned))
              .map((n) => (
                <li key={n.id} className="flex flex-col gap-1 py-3">
                  <span className="type-small text-ink-muted">
                    {n.pinned ? <span className="mr-2 type-caption text-brand">Pinned</span> : null}
                    {formatDate(n.created_at, "en-LK", true)}
                    {n.author ? ` · ${n.author}` : ""}
                  </span>
                  <Markdown>{n.body}</Markdown>
                  {n.canEdit ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={n.pinned ? <PinOff aria-hidden size={14} /> : <Pin aria-hidden size={14} />}
                        onClick={async () => {
                          await updateCustomerNote({ id: n.id, userId, pinned: !n.pinned });
                          router.refresh();
                        }}
                      >
                        {n.pinned ? "Unpin" : "Pin"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 aria-hidden size={14} />}
                        onClick={async () => {
                          if (!window.confirm("Delete this note?")) return;
                          await updateCustomerNote({ id: n.id, userId, remove: true });
                          router.refresh();
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
          </ul>
        ) : (
          <p className="py-6 text-center type-body text-ink-muted">No notes yet.</p>
        )}
      </Card>
      {canOperate ? (
        <Card className="flex flex-col gap-4 self-start">
          <h2 className="type-h2 text-ink">Add note</h2>
          <Field label="Note" hint="Only the team sees notes." required>
            <MarkdownEditor value={body} onChange={setBody} rows={5} />
          </Field>
          <Checkbox label="Pin to the top" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          <Button
            loading={pending}
            disabled={!body.trim()}
            onClick={async () => {
              setPending(true);
              const r = await addCustomerNote({ userId, body, pinned });
              setPending(false);
              toast[r.ok ? "success" : "error"](r.message ?? "");
              if (r.ok) {
                setBody("");
                setPinned(false);
                router.refresh();
              }
            }}
          >
            Add note
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
