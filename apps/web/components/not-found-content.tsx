import { Button } from "@retexia/ui";
import { getT } from "@/lib/strings.server";

/** The 404 message, shared by the site and root not-found pages. */
export async function NotFoundContent() {
  const t = await getT();
  return (
    <div className="flex flex-1 items-center justify-center px-gutter py-24">
      <div className="flex max-w-content flex-col items-center gap-4 text-center">
        <p className="type-eyebrow text-brand">{t("error.404.eyebrow", "Page not found")}</p>
        <h1 className="type-display-xl text-ink">
          {t("error.404.title_start", "This page took a")}{" "}
          <span className="text-brand">{t("error.404.title_highlight", "day off")}</span>
        </h1>
        <p className="max-w-measure type-body-lg text-ink-muted">
          {t("error.404.text", "The link may be old or mistyped. Let's get you back on track.")}
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Button href="/" size="lg">
            {t("error.404.home", "Go to the home page")}
          </Button>
          <Button href="/contact" variant="secondary" size="lg">
            {t("error.404.contact", "Contact us")}
          </Button>
        </div>
      </div>
    </div>
  );
}
