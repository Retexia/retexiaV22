import { Card, buttonClasses } from "@retexia/ui";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Open the Retexia app", robots: { index: false } };

/**
 * Email sign-in links made in the Retexia app come back to https://retexia.com/app-auth?…&token_hash=…
 * On Android with the app installed, App Links open the app straight away (assetlinks.json) and this
 * page is never shown. Otherwise it offers a button that hands the same link to the app
 * (retexia://app-auth?…). This page never uses the link itself, so it can't sign the browser in.
 */
export default function AppAuthPage({ searchParams }: PageProps<"/app-auth">) {
  return (
    <Suspense fallback={null}>
      <OpenApp searchParams={searchParams} />
    </Suspense>
  );
}

const PARAMS = ["token_hash", "type", "code", "next"] as const;

async function OpenApp({ searchParams }: Pick<PageProps<"/app-auth">, "searchParams">) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const k of PARAMS) {
    const v = sp[k];
    if (typeof v === "string" && /^[\w\-./%]{1,500}$/.test(v)) q.set(k, v);
  }
  const ok = q.has("token_hash") || q.has("code");
  return (
    <Card padded className="flex flex-col gap-4">
      <h1 className="type-h1 text-ink">{ok ? "Open the Retexia app" : "This link isn't complete"}</h1>
      {ok ? (
        <>
          <p className="type-body-lg text-ink-muted">This sign-in link is for the Retexia app. Open this page on the phone where the app is installed, then tap the button.</p>
          <a href={`retexia://app-auth?${q.toString()}`} className={buttonClasses({ size: "lg", fullWidth: true })}>
            Open the app
          </a>
          <p className="type-small text-ink-muted">The link works once and for a short time. If it has expired, ask for a new one in the app.</p>
        </>
      ) : (
        <p className="type-body-lg text-ink-muted">Ask for a new sign-in link in the Retexia app.</p>
      )}
    </Card>
  );
}
