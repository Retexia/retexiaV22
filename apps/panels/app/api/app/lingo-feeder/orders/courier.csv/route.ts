import { appLingoFeeder } from "@/lib/app/access";
import { appRoute, json } from "@/lib/app/http";
import { courierCsv, csvResponse } from "@/lib/feeder/lingo-feeder/csv";

/** The next courier file for Feeder Bulk create (the app shares it). Its orders are marked as sent. */
export const GET = appRoute(async (_request, user) => {
  const { userId } = await appLingoFeeder(user);
  const file = await courierCsv(userId);
  if (!file.ok) return json({ error: file.error }, file.status);
  return csvResponse(file);
});
