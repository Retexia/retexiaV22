import { Button } from "@retexia/ui";
import { SignOutButton } from "@/components/auth/mfa";
import { AuthCard } from "@/components/auth/auth-card";
import { webUrl } from "@/lib/env";

export const metadata = { title: "Team only" };

export default function NoAccessPage() {
  return (
    <AuthCard
      title="This area is for the Retexia team"
      subtitle="Your account doesn't have access to the admin panel. Your products and requests are on retexia.com."
      footer={<SignOutButton />}
    >
      <Button href={`${webUrl()}/account`} size="lg" fullWidth>
        Go to my account
      </Button>
    </AuthCard>
  );
}
