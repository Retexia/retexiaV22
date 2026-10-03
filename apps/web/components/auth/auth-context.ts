import "server-only";

import { safeNext } from "@retexia/supabase";
import { getPackages, getProductByPageSlug } from "@/lib/content";
import type { Translate } from "@/lib/strings";

/**
 * When ?next points at an onboarding form (e.g. /lingo/get-started?package=pro),
 * returns a note like "Sign in to set up Lingo Pro".
 */
export async function setupNote(nextParam: string | null | undefined, t: Translate, kind: "login" | "signup") {
  const next = safeNext(nextParam, "");
  const match = /^\/([a-z0-9-]+)\/get-started(?:\?(.*))?$/.exec(next);
  if (!match?.[1]) return null;
  const product = await getProductByPageSlug(match[1]);
  if (!product) return null;
  const packageSlug = new URLSearchParams(match[2] ?? "").get("package");
  const pkg = packageSlug ? (await getPackages(product.id)).find((p) => p.slug === packageSlug) : null;
  const name = pkg?.name ?? product.name;
  return kind === "login"
    ? t("auth.login.setup_note", "Sign in to set up {name}", { name })
    : t("auth.signup.setup_note", "Create an account to set up {name}", { name });
}
