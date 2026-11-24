import { BusinessForm } from "@/components/feeder/lingo-feeder/business-form";
import { lingoFeederContext } from "@/lib/feeder/lingo-feeder/data";

export const metadata = { title: "Business details · Lingo Feeder" };

export default async function BusinessPage() {
  const { ctx } = await lingoFeederContext("/lingo-feeder/business");
  if (!ctx) return null;
  return <BusinessForm seller={ctx.seller} />;
}
