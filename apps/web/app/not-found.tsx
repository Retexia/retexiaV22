import { Logo } from "@retexia/ui";
import { NotFoundContent } from "@/components/not-found-content";
import { getSiteSettings } from "@/lib/content";

/** 404 outside the site layout (e.g. /a/b/c): adds a minimal header. */
export default async function NotFound() {
  const settings = await getSiteSettings();
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="mx-auto flex h-16 w-full max-w-[calc(var(--rx-container)_+_2_*_var(--rx-gutter))] items-center px-gutter md:h-[72px]">
        <Logo name={settings.site_name} src={settings.logo_url} darkSrc={settings.logo_dark_url} />
      </header>
      <main id="main" className="flex flex-1 flex-col">
        <NotFoundContent />
      </main>
    </div>
  );
}
