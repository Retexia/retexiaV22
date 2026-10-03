import { isStaffRole } from "@retexia/supabase";
import { PageHeader } from "@retexia/ui/admin";
import { TeamList } from "@/components/settings/team-list";
import { requireStaffPage } from "@/lib/auth";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const staff = await requireStaffPage("manageTeam");
  const { data } = await staff.supabase
    .from("staff_customers")
    .select("id, full_name, email, role, mfa_enabled, last_sign_in_at, email_confirmed_at")
    .neq("role", "customer")
    .order("role")
    .order("full_name");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Team" description="Who can use the admin and what they can do." />
      <TeamList
        selfId={staff.user.id}
        members={(data ?? [])
          .filter((m) => isStaffRole(m.role))
          .map((m) => ({
            id: m.id!,
            name: m.full_name ?? "",
            email: m.email ?? "",
            role: m.role as "support" | "editor" | "admin" | "owner",
            mfa: Boolean(m.mfa_enabled),
            last_sign_in_at: m.last_sign_in_at,
            confirmed: Boolean(m.email_confirmed_at),
          }))}
      />
    </div>
  );
}
