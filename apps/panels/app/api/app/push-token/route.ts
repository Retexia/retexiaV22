import { z } from "zod";
import { appRoute, body, json } from "@/lib/app/http";

/**
 * The phone's Expo push token. POST on sign-in / app start (moves the phone to this person),
 * DELETE on sign-out. Runs as the person (security definer functions use their auth.uid()).
 */
const token = z.string().trim().regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$/, "Not an Expo push token");
const registerSchema = z.object({
  token,
  platform: z.enum(["android", "ios"]),
  device: z.string().trim().max(120).optional().nullable(),
  version: z.string().trim().max(40).optional().nullable(),
});

export const POST = appRoute(async (request, user) => {
  const d = registerSchema.parse(await body(request));
  const { error } = await user.sb.rpc("register_push_token", { p_token: d.token, p_platform: d.platform, p_device: d.device ?? undefined, p_version: d.version ?? undefined });
  if (error) throw new Error(`register_push_token: ${error.message}`);
  return json({ message: null });
});

export const DELETE = appRoute(async (request, user) => {
  const d = z.object({ token }).parse(await body(request));
  const { error } = await user.sb.rpc("unregister_push_token", { p_token: d.token });
  if (error) throw new Error(`unregister_push_token: ${error.message}`);
  return json({ message: null });
});
