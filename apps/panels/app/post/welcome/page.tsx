import { Card } from "@retexia/ui";
import { redirect } from "next/navigation";
import { Centered } from "@/components/centered";
import { WelcomeForm } from "@/components/post/welcome-form";
import { postDbConfigured } from "@/lib/post/post-db";
import { listBusinesses, requireCustomer } from "@/lib/post/session";

export const metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const customer = await requireCustomer("/welcome");
  if (!postDbConfigured()) {
    return (
      <Centered>
        <Card>
          <p className="type-body text-ink">Retexia Post is not connected to the database yet (SUPABASE_SERVICE_ROLE_KEY).</p>
        </Card>
      </Centered>
    );
  }
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
