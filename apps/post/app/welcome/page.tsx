import { Card } from "@retexia/ui";
import { redirect } from "next/navigation";
import { Centered } from "@/components/centered";
import { WelcomeForm } from "@/components/welcome-form";
import { postDbConfigured } from "@/lib/post-db";
import { ensurePostUser, listBusinesses, requireCustomer } from "@/lib/session";

export const metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const customer = await requireCustomer("/welcome");
  if (!postDbConfigured()) {
    return (
      <Centered>
        <Card>
          <p className="type-body text-ink">Retexia Post is not connected to its database yet (NEXT_PUBLIC_SUPABASE_URL2 / SUPABASE_SERVICE_ROLE_KEY2).</p>
        </Card>
      </Centered>
    );
  }
  // Link the Retexia login to the Post project (also picks up a business made while testing).
  await ensurePostUser(customer);
  if ((await listBusinesses(customer.id)).length) redirect("/");
  return (
    <Centered>
      <Card className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="type-h1 text-ink">Welcome to Retexia Post</h1>
          <p className="type-body text-ink-muted">Tell us about your business. Next you add your brand and products, then we connect Facebook and Instagram for you.</p>
        </div>
        <WelcomeForm />
      </Card>
    </Centered>
  );
}
