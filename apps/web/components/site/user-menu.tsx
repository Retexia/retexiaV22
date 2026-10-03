"use client";

import { Avatar, Button, DropdownMenu, Skeleton, useMounted } from "@retexia/ui";
import { createBrowserClient } from "@retexia/supabase/browser";
import { supabaseEnv } from "@retexia/supabase";
import type { User } from "@retexia/supabase";
import { LayoutGrid, LogOut, Package, UserRound } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "@/lib/strings-context";

type AuthState = { status: "loading" } | { status: "anon" } | { status: "user"; user: User };

/** Signed-in state from the browser session (the header is cached, so this runs client-side). */
export function useAuthUser(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  useEffect(() => {
    if (!supabaseEnv().configured) {
      queueMicrotask(() => setState({ status: "anon" }));
      return;
    }
    const supabase = createBrowserClient();
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setState(data.session ? { status: "user", user: data.session.user } : { status: "anon" });
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState(session ? { status: "user", user: session.user } : { status: "anon" });
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return state;
}

function displayName(user: User) {
  const meta = user.user_metadata as { full_name?: string; name?: string } | undefined;
  return meta?.full_name || meta?.name || user.email || "";
}

async function signOut(router: ReturnType<typeof useRouter>) {
  await createBrowserClient().auth.signOut();
  router.push("/");
  router.refresh();
}

/** "Sign in" link, or an avatar menu (Account, Products, Sign out). */
export function UserMenu() {
  const t = useT();
  const auth = useAuthUser();
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useMounted();

  if (!mounted || auth.status === "loading") return <Skeleton className="size-9 rounded-full" />;

  if (auth.status === "anon") {
    const next = pathname && pathname !== "/" && !pathname.startsWith("/login") ? `?next=${encodeURIComponent(pathname)}` : "";
    return (
      <Button href={`/login${next}`} variant="ghost" size="sm">
        {t("nav.sign_in", "Sign in")}
      </Button>
    );
  }

  const name = displayName(auth.user);
  return (
    <DropdownMenu
      triggerLabel={t("nav.account_menu", "Account menu")}
      triggerClassName="inline-flex rounded-full focus-visible:focus-ring"
      trigger={<Avatar name={name} size={36} />}
      header={
        <div className="flex flex-col">
          <span className="truncate type-label text-ink">{name}</span>
          {auth.user.email && auth.user.email !== name ? (
            <span className="truncate type-small text-ink-muted">{auth.user.email}</span>
          ) : null}
        </div>
      }
      items={[
        { href: "/account", label: t("nav.account", "Account"), icon: <LayoutGrid aria-hidden size={18} strokeWidth={1.5} className="mt-0.5 text-ink-muted" /> },
        { href: "/account/products", label: t("nav.my_products", "My products"), icon: <Package aria-hidden size={18} strokeWidth={1.5} className="mt-0.5 text-ink-muted" /> },
        { href: "/account/profile", label: t("nav.profile", "Profile"), icon: <UserRound aria-hidden size={18} strokeWidth={1.5} className="mt-0.5 text-ink-muted" /> },
        { type: "separator" },
        {
          type: "button",
          label: t("nav.sign_out", "Sign out"),
          icon: <LogOut aria-hidden size={18} strokeWidth={1.5} className="mt-0.5 text-ink-muted" />,
          onSelect: () => void signOut(router),
        },
      ]}
    />
  );
}

/** Account links at the bottom of the mobile menu. */
export function MobileUserLinks() {
  const t = useT();
  const auth = useAuthUser();
  const router = useRouter();
  if (auth.status === "loading") return null;
  if (auth.status === "anon") {
    return (
      <Button href="/login" variant="secondary" size="lg" fullWidth>
        {t("nav.sign_in", "Sign in")}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <Button href="/account" variant="secondary" size="lg" fullWidth>
        {t("nav.account", "Account")}
      </Button>
      <Button variant="ghost" size="lg" fullWidth onClick={() => void signOut(router)}>
        {t("nav.sign_out", "Sign out")}
      </Button>
    </div>
  );
}
