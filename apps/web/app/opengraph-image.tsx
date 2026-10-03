import { ImageResponse } from "next/og";
import { getSiteSettings } from "@/lib/content";

export const alt = "Retexia";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Default link-preview image, built from site_settings (name + tagline). */
export default async function OpengraphImage() {
  const settings = await getSiteSettings();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "#ffffff",
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ position: "absolute", top: -120, right: -80, width: 520, height: 520, borderRadius: 9999, background: "#dbe7fb" }} />
        <div style={{ position: "absolute", bottom: -160, left: -120, width: 420, height: 420, borderRadius: 9999, background: "#eaf1fd" }} />
        <div style={{ fontSize: 44, color: "#2a68d9", letterSpacing: -1, display: "flex" }}>{settings.site_name}</div>
        <div
          style={{
            marginTop: 28,
            fontSize: 64,
            lineHeight: 1.15,
            color: "#16264a",
            fontWeight: 300,
            letterSpacing: -2,
            maxWidth: 900,
            textAlign: "center",
            display: "flex",
          }}
        >
          {settings.tagline ?? settings.seo_default_title ?? settings.site_name}
        </div>
      </div>
    ),
    size,
  );
}
