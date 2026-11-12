"use client";

import { Badge, Button, Card, DropdownMenu, Input, Select } from "@retexia/ui";
import { MoreHorizontal, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { inviteMember, removeMember, setMemberRole } from "@/app/plan/actions";

type Member = { id: string; email: string; name: string; role: "viewer" | "editor"; joined: boolean; user_id: string | null };

/** Who can see this goal: the owner invites by email (view only, or can add values). */
export function GoalPeople({ goalId, owner, members, isOwner, me }: { goalId: string; owner: string; members: Member[]; isOwner: boolean; me: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [busy, setBusy] = useState(false);
  const mine = members.find((m) => m.user_id === me);

  async function invite() {
    setBusy(true);
    const r = await inviteMember({ goal_id: goalId, email, role });
    setBusy(false);
    toast[r.ok ? "success" : "error"](r.message ?? "");
    if (r.ok) {
      setEmail("");
      router.refresh();
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="type-h3 text-ink">People</h2>
      <ul className="flex flex-col gap-2">
        <li className="flex items-center justify-between gap-2 type-body text-ink">
          {owner}
          <Badge tone="brand">Owner</Badge>
        </li>
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1 truncate type-body text-ink">
              {m.name}
              {!m.joined ? <span className="type-small text-ink-muted"> · invited</span> : null}
            </span>
            <span className="type-small text-ink-muted">{m.role === "editor" ? "Can add values" : "Can view"}</span>
            {isOwner ? (
              <DropdownMenu
                align="end"
                triggerLabel={`Options for ${m.name}`}
                triggerClassName="inline-flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunk hover:text-ink focus-visible:focus-ring"
                trigger={<MoreHorizontal aria-hidden size={16} strokeWidth={1.5} />}
                items={[
                  {
                    type: "button",
                    label: m.role === "editor" ? "Make view only" : "Let them add values",
                    onSelect: async () => {
                      const r = await setMemberRole({ id: m.id, role: m.role === "editor" ? "viewer" : "editor" });
                      toast[r.ok ? "success" : "error"](r.message ?? "");
                      router.refresh();
                    },
                  },
                  {
                    type: "button",
                    label: "Remove",
                    danger: true,
                    onSelect: async () => {
                      const r = await removeMember({ id: m.id });
                      toast[r.ok ? "success" : "error"](r.message ?? "");
                      router.refresh();
                    },
                  },
                ]}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {isOwner ? (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <span className="type-small text-ink-muted">Invite someone to follow this goal and chat about it (a partner, a mentor, your team).</span>
          <Input type="email" value={email} placeholder="their@email.com" aria-label="Email to invite" onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && email && invite()} />
          <div className="flex gap-2">
            <Select aria-label="What they can do" value={role} onChange={(e) => setRole(e.target.value as "viewer" | "editor")} options={[{ value: "viewer", label: "Can view and chat" }, { value: "editor", label: "Can also add values" }]} />
            <Button loading={busy} disabled={!email.includes("@")} onClick={invite} icon={<UserPlus aria-hidden size={16} strokeWidth={1.5} />}>
              Invite
            </Button>
          </div>
        </div>
      ) : mine ? (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={async () => {
            if (!window.confirm("Leave this goal? You won't see it any more.")) return;
            const r = await removeMember({ id: mine.id });
            toast[r.ok ? "success" : "error"](r.message ?? "");
            if (r.ok) router.push("/goals");
          }}
        >
          Leave this goal
        </Button>
      ) : null}
    </Card>
  );
}
