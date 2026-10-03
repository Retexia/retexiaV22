import { PageHeader } from "@retexia/ui/admin";
import { GeneralForm } from "@/components/settings/general-form";
import { requireStaffPage } from "@/lib/auth";

export const metadata = { title: "General settings" };

export default async function GeneralSettingsPage() {
  const { supabase } = await requireStaffPage("manageSettings");
  const { data: s } = await supabase.from("site_settings").select("*").eq("id", 1).single();
  const str = (v: string | null | undefined) => v ?? "";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="General" description="Business details, logos, search defaults, announcement and maintenance." />
      {s ? (
        <GeneralForm
          initial={{
            site_name: s.site_name,
            tagline: str(s.tagline),
            contact_email: str(s.contact_email),
            contact_phone: str(s.contact_phone),
            whatsapp_number: str(s.whatsapp_number),
            whatsapp_default_message: str(s.whatsapp_default_message),
            address: str(s.address),
            business_hours: str(s.business_hours),
            logo_url: str(s.logo_url),
            logo_dark_url: str(s.logo_dark_url),
            favicon_url: str(s.favicon_url),
            og_image_url: str(s.og_image_url),
            seo_title_template: s.seo_title_template,
            seo_default_title: str(s.seo_default_title),
            seo_default_description: str(s.seo_default_description),
            footer_text: str(s.footer_text),
            copyright_text: str(s.copyright_text),
            social_links: Array.isArray(s.social_links) ? (s.social_links as { label?: string; url?: string }[]).map((l) => ({ label: l.label ?? "", url: l.url ?? "" })) : [],
            announcement_enabled: s.announcement_enabled,
            announcement_text: str(s.announcement_text),
            announcement_href: str(s.announcement_href),
            maintenance_mode: s.maintenance_mode,
            maintenance_message: str(s.maintenance_message),
            default_theme: (["light", "dark", "system"].includes(s.default_theme) ? s.default_theme : "system") as "light" | "dark" | "system",
            currency_code: s.currency_code,
            currency_locale: s.currency_locale,
            auth_google_enabled: s.auth_google_enabled,
            auth_magic_link_enabled: s.auth_magic_link_enabled,
          }}
        />
      ) : null}
    </div>
  );
}
