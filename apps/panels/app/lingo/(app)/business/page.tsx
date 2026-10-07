import { PageHeader } from "@retexia/ui/admin";
import { BusinessForm } from "@/components/lingo/business-form";
import { requireLingoPage } from "@/lib/lingo/session";

export const metadata = { title: "Business details" };

export default async function BusinessPage() {
  const { tenant, db } = await requireLingoPage("/business");
  const { data: b } = await db.from("business_details").select("*").eq("lingo_user_id", tenant.id).maybeSingle();
  const s = (v: string | null | undefined) => v ?? "";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Business details" description="Lingo answers questions about your shop from these. Keep them up to date: opening hours, delivery and payment especially." />
      <BusinessForm
        initial={{
          business_type: s(b?.business_type),
          about: s(b?.about),
          address: s(b?.address),
          location_url: s(b?.location_url),
          opening_hours: s(b?.opening_hours),
          contact_phone: s(b?.contact_phone),
          website: s(b?.website),
          delivery_areas: s(b?.delivery_areas),
          delivery_time: s(b?.delivery_time),
          default_delivery_fee: String(b?.default_delivery_fee ?? 0),
          payment_methods: s(b?.payment_methods),
          extra_info: s(b?.extra_info),
        }}
      />
    </div>
  );
}
