import { NextResponse, type NextRequest } from "next/server";
import { webUrl } from "@/lib/env";
import { projectRef } from "@/lib/handoff";
import { panelForHost } from "@/lib/panel";

/** Setup check for the Retexia team: which panel and Supabase project this deployment uses (no secrets). */
export function GET(request: NextRequest) {
  return NextResponse.json(
    {
      panel: panelForHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host")),
      supabase_project: projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL),
      anon_key_set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      service_role_key_set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      web_url: webUrl(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
