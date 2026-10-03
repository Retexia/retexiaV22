import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotForm } from "@/components/auth/simple-forms";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      subtitle="We will email you a link to choose a new one."
      footer={
        <Link href="/login" className="text-link hover:text-brand-hover">
          Back to sign in
        </Link>
      }
    >
      <ForgotForm />
    </AuthCard>
  );
}
