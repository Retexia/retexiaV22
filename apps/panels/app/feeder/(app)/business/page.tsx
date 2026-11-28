import { PageHeader } from "@retexia/ui/admin";
import { BusinessDetails } from "@/components/feeder/business-details";
import { feederDb } from "@/lib/feeder/db";
import { lfDb } from "@/lib/feeder/lingo-feeder/db";
import { USES, ownsAny, requireSharedPage, toolsUsing } from "@/lib/feeder/shared";

export const metadata = { title: "Business details" };

/** feeder.retexia.com/business: one set of business details for every Feeder tool. */
export default async function BusinessPage() {
  const { user, packages } = await requireSharedPage("/business");
  const lingo = ownsAny(packages, USES.whatsapp);
  const [{ data: c }, seller] = await Promise.all([
    feederDb().from("customers").select("business_name, phone, location, address, delivery_days, call_hours, about").eq("user_id", user.id).maybeSingle(),
    lingo ? lfDb().from("sellers").select("ads_only").eq("user_id", user.id).maybeSingle().then((r) => r.data, () => null) : Promise.resolve(null),
  ]);
  const users = toolsUsing(packages, ["lingo-feeder", "auto-comment"]).filter((p) => p.owned).map((p) => p.name);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Business details"
        description={`Your shop, once for every tool${users.length ? `: ${users.join(" and ")} ${users.length > 1 ? "use" : "uses"} these details when talking to your customers` : ""}.`}
      />
      <BusinessDetails
        initial={{
          business_name: (c?.business_name as string | null) ?? "",
          phone: (c?.phone as string | null) ?? "",
          location: (c?.location as string | null) ?? "",
          address: (c?.address as string | null) ?? "",
          delivery_days: (c?.delivery_days as string | null) ?? "2-3",
          call_hours: (c?.call_hours as string | null) ?? "9am - 6pm",
          about: (c?.about as string | null) ?? "",
        }}
        adsOnly={lingo ? Boolean((seller as { ads_only?: boolean } | null)?.ads_only) : null}
      />
    </div>
  );
}
