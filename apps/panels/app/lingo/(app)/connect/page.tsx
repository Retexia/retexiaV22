import { Alert } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import { WhatsAppConnect } from "@/components/lingo/whatsapp-connect";
import { connectionState } from "@/lib/lingo/evolution";
import { requireLingoPage } from "@/lib/lingo/session";

export const metadata = { title: "Connect WhatsApp" };

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const [{ tenant, db }, sp] = await Promise.all([requireLingoPage("/connect"), searchParams]);
  const { data: c } = await db.from("lingo_users").select("evolution_base_url, evolution_instance, evolution_apikey").eq("id", tenant.id).single();
  const state = c ? await connectionState(c.evolution_base_url, c.evolution_instance, c.evolution_apikey) : "unknown";
  const welcome = sp.welcome === "1";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={welcome ? "Last step: link your WhatsApp" : "WhatsApp connection"} description="Lingo answers from your own business number, through WhatsApp's Linked devices." />
      {welcome ? (
        <Alert tone="info" title="While you're here">
          After linking, add your products and business details so Lingo can answer prices, delivery and opening hours.
        </Alert>
      ) : null}
      <WhatsAppConnect initialState={state} number={tenant.owner_phone ?? ""} onboarding={welcome} />
      <Alert tone="info" title="Good to know">
        Keep the phone online now and then: WhatsApp unlinks devices after about 14 days without the phone connecting. You can keep using WhatsApp on the phone as usual; Lingo only answers new customer messages.
      </Alert>
    </div>
  );
}
