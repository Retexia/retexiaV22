import { appLingoFeeder } from "@/lib/app/access";
import { appRoute, body, result } from "@/lib/app/http";
import { resetTry, tryLingo } from "@/lib/feeder/lingo-feeder/ops";

/** Try Lingo: one test message through the real engine (nothing goes to WhatsApp). DELETE starts a new test chat. */
export const POST = appRoute(async (request, user) => {
  const { userId, name } = await appLingoFeeder(user);
  const b = await body(request);
  return result(await tryLingo(userId, {
    text: typeof b.text === "string" ? b.text : "",
    tap: (b.tap ?? null) as { id: string; title: string } | null,
    start_product: (b.start_product ?? null) as number | null,
    name: typeof b.name === "string" ? b.name : name,
  }, "app"));
});

export const DELETE = appRoute(async (_request, user) => {
  const { userId } = await appLingoFeeder(user);
  return result(await resetTry(userId));
});
