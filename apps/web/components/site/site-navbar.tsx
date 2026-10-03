"use client";

import { NavBar } from "@retexia/ui";
import type { ComponentProps } from "react";
import { useAuthUser } from "./user-menu";

/** NavBar that swaps header buttons to their signed-in version ("My account"). */
export function SiteNavBar(props: Omit<ComponentProps<typeof NavBar>, "signedIn">) {
  const auth = useAuthUser();
  return <NavBar {...props} signedIn={auth.status === "user"} />;
}
