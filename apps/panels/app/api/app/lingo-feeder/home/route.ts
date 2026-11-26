import { appLingoFeeder } from "@/lib/app/access";
import { appRoute } from "@/lib/app/http";
import { home } from "@/lib/feeder/lingo-feeder/data";
import { lfDb } from "@/lib/feeder/lingo-feeder/db";

/** Lingo Feeder home: Lingo on/off, the WhatsApp number's state, today's and this month's numbers, status counts. */
export const GET = appRoute(async (_request, user) => {
  const { userId } = await appLingoFeeder(user);
  const db = lfDb();
  const [{ data: seller }, { data: number }, stats] = await Promise.all([
    db.from("sellers").select("business_name, status").eq("user_id", userId).single(),
    db.from("numbers").select("display_phone, verified_name, status, quality_rating, problem, last_webhook_at").eq("user_id", userId).maybeSingle(),
    home(userId),
  ]);
  return { seller, number: number ?? null, stats };
});
