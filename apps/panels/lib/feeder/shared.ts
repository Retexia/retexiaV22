import "server-only";

import { getFeeder, requireFeederPage } from "./access";

/**
 * What the Feeder tools share: one business, one product list, one set of connections.
 * Each connection is only for sellers who have a tool that uses it (authorization by package,
 * so it keeps working when a free tool becomes paid or a new tool is added).
 */
export const USES = {
  /** Facebook / Instagram / TikTok ad accounts and the Page. */
  ads: ["autopublish", "auto-comment"],
  /** The WhatsApp Cloud API number. */
  whatsapp: ["lingo-feeder"],
} as const;

type Pkg = { slug: string; name: string; owned: boolean };
export const ownsAny = (packages: Pkg[], slugs: readonly string[]) => packages.some((p) => p.owned && slugs.includes(p.slug));
export const toolsUsing = (packages: Pkg[], slugs: readonly string[]) => packages.filter((p) => slugs.includes(p.slug));

/** For the shared pages (Business details, Connections): any signed-in Feeder customer. */
export async function requireSharedPage(path: string) {
  return requireFeederPage(path);
}

/** For server actions on the ad connections: owners of a tool that uses them. */
export async function adsConnectionUser() {
  const feeder = await getFeeder();
  if (!feeder || !ownsAny(feeder.packages, USES.ads)) return null;
  return feeder.user;
}
