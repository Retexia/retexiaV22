import { SettingsForm } from "@/components/feeder/lingo/settings-form";
import { lingoContext } from "@/lib/feeder/lingo/data";

export const metadata = { title: "Settings · Lingo" };

export default async function LingoSettings() {
  const { ctx } = await lingoContext("/lingo/settings");
  if (!ctx) return null;
  return <SettingsForm seller={ctx.seller} />;
}
