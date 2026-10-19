import { Alert, Button, Card } from "@retexia/ui";
import { DescriptionList, PageHeader } from "@retexia/ui/admin";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireStaffPage } from "@/lib/auth";
import { adminUrl } from "@/lib/env";
import { param, type SearchParams } from "@/lib/list-params";
import { listPages, metaRedirectUri, metaSetupProblem, readLogin } from "@/lib/meta";
import { getPostBusiness, pageOwners } from "@/products/post/data";
import { MetaPagePicker, type PageChoice } from "@/products/post/meta-picker";

export const metadata = { title: "Add Facebook & Instagram" };

const MESSAGES: Record<string, { tone: "warning" | "danger" | "info"; text: string }> = {
  cancelled: { tone: "info", text: "Facebook login was cancelled. Nothing was saved." },
  expired: { tone: "warning", text: "That login link expired or was started by someone else. Log in again." },
  gone: { tone: "danger", text: "This Post business no longer exists." },
};

/**
 * Connect a customer's Facebook Page and Instagram from the admin: log in to
 * Facebook, then tick which Page belongs to this customer. Nothing is saved
 * before the tick (a staff login can manage many customers' Pages).
 */
export default async function ConnectMetaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const staff = await requireStaffPage("manageCustomers");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await getPostBusiness(id);
  if (!data) notFound();
  const { business: b, owner, accounts } = data;

  const login = await readLogin(staff.user.id, id);
  const from = login?.from ?? (param(sp, "from") === "customer" ? "customer" : "business");
  const backHref = from === "customer" && owner ? `/customers/${owner.id}` : `/products/post/businesses/${id}`;
  const setup = metaSetupProblem();
  const meta = param(sp, "meta");
  const notice = meta === "error" ? { tone: "danger" as const, text: `Facebook didn't complete the login: ${param(sp, "reason") ?? "unknown error"}` } : meta ? MESSAGES[meta] : undefined;

  let choices: PageChoice[] | null = null;
  let pagesError: string | null = null;
  if (login) {
    const pages = await listPages(login.token);
    if (!pages.ok) pagesError = pages.error;
    else {
      const owners = await pageOwners(pages.data.flatMap((p) => [p.id, p.instagram?.id].filter((x): x is string => Boolean(x))));
      choices = pages.data.map((p) => {
        const on = [owners.get(p.id), p.instagram ? owners.get(p.instagram.id) : undefined].filter(Boolean) as { id: string; name: string }[];
        const other = on.find((o) => o.id !== b.id);
        return { id: p.id, name: p.name, instagram: p.instagram ? (p.instagram.username ?? p.instagram.id) : null, here: !other && on.some((o) => o.id === b.id), elsewhere: other?.name ?? null };
      });
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6">
      <PageHeader back={{ href: backHref, label: from === "customer" ? "Customer" : b.name }} title="Add Facebook & Instagram" description="Connect this customer's Page and Instagram without signing in to their Retexia account." />

      <Card className="flex flex-col gap-3 border-brand">
        <h2 className="type-h3 text-ink">Connecting for</h2>
        <DescriptionList
          items={[
            { label: "Post business", value: b.name },
            { label: "Customer", value: owner ? `${owner.name}${owner.email ? ` (${owner.email})` : ""}` : "Owner not found" },
            { label: "Request", value: owner?.orderRef ?? "None" },
            { label: "Connected now", value: accounts.length ? accounts.map((a) => `${a.platform === "facebook" ? "Facebook" : "Instagram"}: ${a.display_name ?? a.external_id}`).join(", ") : "Nothing yet" },
          ]}
        />
      </Card>

      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      {setup ? (
        <Alert tone="warning" title="Not set up yet">
          {setup}
        </Alert>
      ) : null}
      {pagesError ? <Alert tone="danger">Couldn&apos;t read the Pages from Facebook: {pagesError}</Alert> : null}

      {choices ? (
        <MetaPagePicker businessId={b.id} businessName={b.name} pages={choices} backHref={backHref} />
      ) : (
        <Card className="flex flex-col gap-4">
          <h2 className="type-h3 text-ink">Log in with Facebook</h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5 type-body text-ink">
            <li>Log in with a Facebook account that manages this customer&apos;s Page: yours (if they gave you access to the Page) or theirs, if they are with you.</li>
            <li>When Facebook asks, allow everything. If it asks which Pages, you can choose only this customer&apos;s.</li>
            <li>Back here, tick this customer&apos;s Page. Nothing is saved until you do.</li>
          </ol>
          <p className="type-small text-ink-muted">
            While the Meta app is in Development mode, the Facebook account must have a role on the app (Meta for Developers → App roles). The app needs this redirect address under Facebook Login → Valid OAuth Redirect URIs: <code className="type-code">{metaRedirectUri()}</code>
          </p>
          {/* A full page load (never prefetched): it starts a one-time Facebook login. */}
          <Button href={`${adminUrl()}/meta/connect?business=${b.id}&from=${from}`} target="_self" rel="nofollow" className="self-start" disabled={Boolean(setup)}>
            Log in with Facebook
          </Button>
        </Card>
      )}
    </div>
  );
}
