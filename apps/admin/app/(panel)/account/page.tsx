import { roleLabels } from "@retexia/supabase";
import { PageHeader } from "@retexia/ui/admin";
import { MfaPanel, PasswordPanel, ProfilePanel } from "@/components/auth/account-panels";
import { requireStaffPage } from "@/lib/auth";

export const metadata = { title: "Your account" };

export default async function AccountPage() {
  const { profile, user, role } = await requireStaffPage("view");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Your account" description="Your name, password and two-step sign-in." />
      <ProfilePanel initial={{ full_name: profile.full_name ?? "", phone: profile.phone ?? "" }} email={user.email ?? ""} role={roleLabels[role]} />
      <PasswordPanel />
      <MfaPanel />
    </div>
  );
}
