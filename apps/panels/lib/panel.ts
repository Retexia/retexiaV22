/** Which product panel a host serves: post.retexia.com → "post", lingo.retexia.com → "lingo", feeder.retexia.com → "feeder". */
export const PANELS = ["post", "lingo", "feeder"] as const;
export type Panel = (typeof PANELS)[number];

export function panelForHost(host: string | null | undefined): Panel {
  const sub = (host ?? "").split(":")[0]!.split(".")[0]!.toLowerCase();
  if ((PANELS as readonly string[]).includes(sub)) return sub as Panel;
  // localhost / preview URLs: PANEL_DEFAULT picks the panel (cookies are shared across ports on localhost).
  const fallback = process.env.PANEL_DEFAULT;
  return fallback && (PANELS as readonly string[]).includes(fallback) ? (fallback as Panel) : "post";
}

export const PANEL_LABEL: Record<Panel, string> = { post: "Post", lingo: "Lingo", feeder: "Feeder" };
