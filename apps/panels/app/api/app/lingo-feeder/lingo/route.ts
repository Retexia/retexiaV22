import { z } from "zod";
import { appLingoFeeder } from "@/lib/app/access";
import { appRoute, body, result } from "@/lib/app/http";
import { setLingoOn } from "@/lib/feeder/lingo-feeder/ops";

/** Turn Lingo on or off for the whole number ({ on: boolean }). */
export const POST = appRoute(async (request, user) => {
  const { userId } = await appLingoFeeder(user);
  const { on } = z.object({ on: z.boolean() }).parse(await body(request));
  return result(await setLingoOn(userId, on));
});
