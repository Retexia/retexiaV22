"use client";

import { STAFF_ROLES, roleLabels, type StaffRole } from "@retexia/supabase";
import { Avatar, Badge, Button, Card, Dialog, Field, Input, Select, formatDate } from "@retexia/ui";
import { ConfirmDialog } from "@retexia/ui/admin";
import { UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { inviteStaff, resetStaffMfa, setStaffRole } from "@/app/(panel)/settings/team/actions";

export type TeamMember = { id: string; name: string; email: string; role: StaffRole; mfa: boolean; last_sign_in_at: string | null; confirmed: boolean };

const ROLE_HELP: Record<StaffRole, string> = {
  support: "Requests, payments, customers and inbox. No settings or website editing.",
  editor: "Website pages, sections, media and text. Can view requests.",
  admin: "Everything except team, integrations and deleting logins.",
  owner: "Everything, including the team and integration secrets.",
};

export function TeamList({ members, selfId }: { members: TeamMember[]; selfId: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<{ email: string; full_name: string; role: StaffRole } | null>(null);
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState<TeamMember | null>(null);
  const [reset, setReset] = useState<TeamMember | null>(null);
  const owners = members.filter((m) => m.role === "owner").length;

  const change = async (m: TeamMember, role: string) => {
    if (m.role === "owner" && owners === 1 && role !== "owner") return toast.error("There must always be at least one owner.");
    const r = await setStaffRole({ userId: m.id, role });
    toast[r.ok ? "success" : "error"](r.message ?? "");
    if (r.ok) router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button icon={<UserPlus aria-hidden size={16} strokeWidth={1.5} />} onClick={() => setInvite({ email: "", full_name: "", role: "support" })}>
          Invite team member
        </Button>
      </div>
      <Card padded={false}>
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <Avatar name={m.name || m.email} size={36} />
              <div className="flex min-w-0 flex-1 flex-col">
                <Link href={`/customers/${m.id}`} className="type-label text-ink hover:text-brand">
                  {m.name || m.email}
                  {m.id === selfId ? <span className="type-small text-ink-muted"> (you)</span> : null}
                </Link>
                <span className="truncate type-small text-ink-muted">
                  {m.email} · {m.last_sign_in_at ? `last sign-in ${formatDate(m.last_sign_in_at, "en-LK", true)}` : m.confirmed ? "never signed in" : "invitation not accepted yet"}
                </span>
              </div>
              {m.mfa ? <Badge tone="success">Two-step on</Badge> : <Badge tone="warning">Two-step not set up</Badge>}
              <select
                aria-label={`Role of ${m.name || m.email}`}
                value={m.role}
                disabled={m.id === selfId}
                onChange={(e) => change(m, e.target.value)}
                className="h-9 rounded-md border border-line-strong bg-surface-raised px-2 type-body text-ink focus-visible:focus-ring disabled:opacity-60"
              >
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabels[r]}
                  </option>
                ))}
              </select>
              {m.id !== selfId && m.mfa ? (
                <Button size="sm" variant="ghost" onClick={() => setReset(m)}>
                  Reset two-step
                </Button>
              ) : null}
              {m.id !== selfId ? (
                <Button size="sm" variant="ghost" onClick={() => setRemove(m)}>
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      <Card className="flex flex-col gap-2">
        <h2 className="type-h3 text-ink">What each role can do</h2>
        <dl className="grid gap-2 sm:grid-cols-2">
          {STAFF_ROLES.map((r) => (
            <div key={r}>
              <dt className="type-label text-ink">{roleLabels[r]}</dt>
              <dd className="type-small text-ink-muted">{ROLE_HELP[r]}</dd>
            </div>
          ))}
        </dl>
        <p className="type-small text-ink-muted">Everyone on the team must set up two-step sign-in (an authenticator app) before they can use the admin.</p>
      </Card>

      <Dialog
        open={Boolean(invite)}
        onOpenChange={(o) => !o && setInvite(null)}
        title="Invite a team member"
        description="They get an email to set a password, then set up two-step sign-in. If the email already has a customer account, it gets the role straight away."
        footer={
          <>
            <Button variant="ghost" onClick={() => setInvite(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                if (!invite) return;
                setBusy(true);
                const r = await inviteStaff(invite);
                setBusy(false);
                toast[r.ok ? "success" : "error"](r.message ?? "");
                if (r.ok) {
                  setInvite(null);
                  router.refresh();
                }
              }}
            >
              Send invitation
            </Button>
          </>
        }
      >
        {invite ? (
          <div className="flex flex-col gap-4">
            <Field label="Name" required>
              <Input autoFocus value={invite.full_name} onChange={(e) => setInvite({ ...invite, full_name: e.target.value })} />
            </Field>
            <Field label="Email" required>
              <Input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            </Field>
            <Field label="Role" hint={ROLE_HELP[invite.role]}>
              <Select value={invite.role} onChange={(e) => setInvite({ ...invite, role: (e.target.value || "support") as StaffRole })} options={STAFF_ROLES.map((r) => ({ value: r, label: roleLabels[r] }))} />
            </Field>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(reset)}
        onOpenChange={(o) => !o && setReset(null)}
        title={`Reset two-step sign-in for ${reset?.name || reset?.email}?`}
        description="Use this when they lost their phone. Their authenticators are removed; at their next sign-in they scan a new QR code. Their current session ends within the hour."
        confirmLabel="Reset two-step sign-in"
        onConfirm={async () => {
          if (!reset) return;
          const r = await resetStaffMfa({ userId: reset.id });
          toast[r.ok ? "success" : "error"](r.message ?? "");
          setReset(null);
          if (r.ok) router.refresh();
        }}
      />
      <ConfirmDialog
        open={Boolean(remove)}
        onOpenChange={(o) => !o && setRemove(null)}
        title={`Remove ${remove?.name || remove?.email} from the team?`}
        description="They lose access to the admin straight away. Their login stays as a normal customer account."
        confirmLabel="Remove from team"
        onConfirm={async () => {
          if (!remove) return;
          await change(remove, "customer");
          setRemove(null);
        }}
      />
    </div>
  );
}
