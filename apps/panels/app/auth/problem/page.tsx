import { Button, Card } from "@retexia/ui";
import { headers } from "next/headers";
import { Centered } from "@/components/centered";
import { webUrl } from "@/lib/env";
import { panelForHost } from "@/lib/panel";

export const metadata = { title: "Can't open your panel" };

const MESSAGES: Record<string, { title: string; body: string; team?: string }> = {
  loop: {
    title: "We couldn't sign you in here",
    body: "You're signed in on retexia.com, but this panel couldn't confirm it. Please try again. If it keeps happening, message Retexia.",
    team: "The hand-off from retexia.com did not complete three times in a row. Check that this panel's Vercel project has the same NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY as the website, and NEXT_PUBLIC_WEB_URL=https://www.retexia.com.",
  },
  state: { title: "That sign-in link expired", body: "Please open the panel again from your Retexia account." },
  token: { title: "Please sign in again", body: "Your sign-in could not be confirmed. Sign out on retexia.com, sign in again, then open the panel." },
  config: {
    title: "This panel is being set up",
    body: "We're finishing a setting on our side. Please try again in a few minutes.",
    team: "This panel's Vercel project is missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY (or the key is wrong). Add them and redeploy.",
  },
  project: {
    title: "This panel is being set up",
    body: "We're finishing a setting on our side. Please try again in a few minutes.",
    team: "The website and this panel use different Supabase projects. Give this panel's Vercel project the website's NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY, then redeploy.",
  },
};

export default async function AuthProblem({ searchParams }: { searchParams: Promise<{ reason?: string; site?: string; panel?: string }> }) {
  const sp = await searchParams;
  const h = await headers();
  const product = panelForHost(h.get("x-forwarded-host") ?? h.get("host"));
  const m = MESSAGES[sp.reason ?? ""] ?? MESSAGES.token!;
  const ref = (v?: string) => (v && /^[a-z0-9]{1,40}$/.test(v) ? v : "?");
  return (
    <Centered product={product}>
      <Card className="flex flex-col items-center gap-4 text-center">
        <h1 className="type-h1 text-ink">{m.title}</h1>
        <p className="type-body text-ink-muted">{m.body}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button href="/">Try again</Button>
          <Button href={`${webUrl()}/account`} variant="secondary">
            My account
          </Button>
        </div>
        {m.team ? (
          <details className="w-full text-left type-small text-ink-muted">
            <summary className="cursor-pointer">For the Retexia team</summary>
            <p className="mt-2">{m.team}</p>
            {sp.reason === "project" ? (
              <p className="mt-1">
                Website project: <code>{ref(sp.site)}</code> · this panel: <code>{ref(sp.panel)}</code>
              </p>
            ) : null}
          </details>
        ) : null}
      </Card>
    </Centered>
  );
}
