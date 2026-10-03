"use client";

import { Alert, Button, Card, Dialog, Field, Input } from "@retexia/ui";
import { Search, UserPlus, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { findCustomers, inviteCustomer, type CustomerOption } from "@/app/(panel)/customers/actions";

/** Search an existing customer by name, email or phone, or (admins) invite a new one. */
export function CustomerPicker({ value, onChange, canInvite }: { value: CustomerOption | null; onChange: (c: CustomerOption | null) => void; canInvite: boolean }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: "", full_name: "", phone: "", business_name: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) return;
    let active = true;
    const t = window.setTimeout(async () => {
      const r = await findCustomers(query);
      if (active) setResults(r);
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(t);
    };
  }, [query]);

  if (value) {
    return (
      <Card className="flex items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 flex-col">
          <span className="type-label text-ink">{value.name}</span>
          <span className="truncate type-small text-ink-muted">{[value.email, value.phone].filter(Boolean).join(" · ")}</span>
        </div>
        <Button variant="ghost" size="sm" icon={<X aria-hidden size={14} />} onClick={() => onChange(null)}>
          Change
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search aria-hidden size={16} strokeWidth={1.5} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
        <input
          id={id}
          aria-label="Search customers"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email or phone"
          className="h-10 w-full rounded-md border border-line-strong bg-surface-raised pr-3 pl-9 type-body text-ink placeholder:text-ink-muted focus-visible:border-brand focus-visible:focus-ring"
        />
      </div>
      {query.trim().length >= 2 ? (
        <ul className="flex flex-col rounded-md border border-line" aria-label="Matching customers">
          {results.length ? (
            results.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onChange(c)} className="flex w-full flex-col px-3 py-2 text-left hover:bg-surface-sunk focus-visible:focus-ring">
                  <span className="type-label text-ink">{c.name}</span>
                  <span className="type-small text-ink-muted">{[c.email, c.phone].filter(Boolean).join(" · ")}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-3 type-small text-ink-muted">No customer found.</li>
          )}
        </ul>
      ) : null}
      {canInvite ? (
        <Button variant="ghost" size="sm" className="self-start" icon={<UserPlus aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setInviteOpen(true)}>
          Invite a new customer
        </Button>
      ) : (
        <p className="type-small text-ink-muted">New customers can be invited by an admin, or they can sign up on retexia.com.</p>
      )}
      <Dialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Invite a customer"
        description="They get an email to set a password. You can create the request right away."
        footer={
          <>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={pending}
              onClick={async () => {
                setError(null);
                setPending(true);
                const r = await inviteCustomer(invite);
                setPending(false);
                if (r.ok && r.data) {
                  toast.success(r.message ?? "Invited");
                  onChange({ id: r.data, name: invite.full_name, email: invite.email, phone: invite.phone || null });
                  setInviteOpen(false);
                } else setError(r.ok ? "Could not invite." : r.message);
              }}
            >
              Send invitation
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {error ? <div className="sm:col-span-2"><Alert tone="danger">{error}</Alert></div> : null}
          <Field label="Full name" required>
            <Input value={invite.full_name} onChange={(e) => setInvite({ ...invite, full_name: e.target.value })} />
          </Field>
          <Field label="Email" required>
            <Input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          </Field>
          <Field label="Phone" optionalLabel="Optional">
            <Input type="tel" value={invite.phone} onChange={(e) => setInvite({ ...invite, phone: e.target.value })} />
          </Field>
          <Field label="Business name" optionalLabel="Optional">
            <Input value={invite.business_name} onChange={(e) => setInvite({ ...invite, business_name: e.target.value })} />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
