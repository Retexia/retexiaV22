import { Card } from "@retexia/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { ProfileForm } from "@/components/account/profile-form";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/strings.server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("account.profile.title", "Profile") };
}

export default async function ProfilePage() {
  const [{ user, profile }, t] = await Promise.all([requireUser("/account/profile"), getT()]);
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="type-h1 text-ink">{t("account.profile.title", "Profile")}</h1>
        <p className="type-body-lg text-ink-muted">
          {t("account.profile.subtitle", "We use these details to set up your products and reach you.")}
        </p>
      </header>
      <Card className="p-6 md:p-8">
        <ProfileForm
          initial={{
            full_name: profile?.full_name ?? "",
            phone: profile?.phone ?? "",
            whatsapp: profile?.whatsapp ?? "",
            business_name: profile?.business_name ?? "",
            marketing_opt_in: profile?.marketing_opt_in ?? false,
          }}
        />
      </Card>
      <p className="type-body text-ink-muted">
        {t("account.profile.email_note", "You sign in with {email}.", { email: user.email ?? "" })}{" "}
        <Link href="/account/security" className="text-link hover:text-brand-hover">
          {t("account.profile.change_email", "Change email")}
        </Link>
      </p>
    </div>
  );
}
