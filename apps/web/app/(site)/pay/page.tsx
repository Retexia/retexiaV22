import { Container } from "@retexia/ui";
import type { Metadata } from "next";
import { connection } from "next/server";
import { PaddleLinkCheckout } from "@/components/account/paddle-link-checkout";
import { paddleEnv } from "@/lib/paddle.server";
import { getT } from "@/lib/strings.server";

export const metadata: Metadata = { title: "Secure checkout", robots: { index: false, follow: false } };

/** Paddle → Checkout settings → Default payment link: https://www.retexia.com/pay */
export default async function PayPage({ searchParams }: PageProps<"/pay">) {
  await connection();
  const sp = await searchParams;
  const t = await getT();
  return (
    <Container className="flex min-h-[50vh] max-w-content flex-col justify-center gap-4 py-16">
      <h1 className="type-h1 text-ink">{t("pay.title", "Secure checkout")}</h1>
      <PaddleLinkCheckout
        env={paddleEnv()}
        token={process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? ""}
        hasTransaction={typeof sp._ptxn === "string" && /^txn_[a-z0-9]+$/i.test(sp._ptxn)}
        labels={{
          opening: t("pay.opening", "Opening Paddle's secure checkout…"),
          missing: t("pay.missing", "This payment link is incomplete. Open your request in your account and press Pay now."),
          failed: t("pay.failed", "The checkout couldn't load. Check your connection and refresh the page."),
        }}
      />
    </Container>
  );
}
