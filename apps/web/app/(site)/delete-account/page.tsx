import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Delete your Retexia account",
  description: "How to delete your Retexia account and the data in it, from the Retexia app or on retexia.com.",
};

/**
 * Public page for account deletion (Google Play's Data safety form and Apple ask for one).
 * The request itself is made signed in: in the app (Account → Delete my account) or on
 * retexia.com (Account → Security → Delete my account). See migration 0044.
 */
export default function DeleteAccountPage() {
  return (
    <main className="mx-auto flex w-full max-w-[calc(var(--rx-content)_+_2_*_var(--rx-gutter))] flex-col gap-8 px-gutter py-16">
      <header className="flex flex-col gap-3">
        <p className="type-eyebrow text-ink-muted">Retexia account</p>
        <h1 className="type-display text-ink">Delete your account</h1>
        <p className="type-body-lg text-ink-muted">
          You can ask us to delete your Retexia account at any time. This covers retexia.com, the Retexia app and every Retexia product (Lingo, Post, Feeder, Plan).
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="type-h2 text-ink">In the Retexia app</h2>
        <ol className="type-body flex list-decimal flex-col gap-1 pl-5 text-ink-muted">
          <li>Open the app and sign in.</li>
          <li>Go to Account.</li>
          <li>Tap Delete my account and confirm.</li>
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="type-h2 text-ink">On retexia.com</h2>
        <ol className="type-body flex list-decimal flex-col gap-1 pl-5 text-ink-muted">
          <li>
            <Link href="/login?next=%2Faccount%2Fsecurity%23delete" className="text-link underline-offset-2 hover:underline">
              Sign in
            </Link>{" "}
            with the email you use for Retexia.
          </li>
          <li>Go to Account → Security.</li>
          <li>Choose Delete my account and confirm.</li>
        </ol>
        <p className="type-body text-ink-muted">Can&apos;t sign in? Reset your password first, or write to us from the email on your account and we&apos;ll help.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="type-h2 text-ink">What we delete</h2>
        <ul className="type-body flex list-disc flex-col gap-1 pl-5 text-ink-muted">
          <li>Your profile and sign-in (email, name, phone).</li>
          <li>Your requests, payments and receipts.</li>
          <li>What&apos;s in your products: chats, orders, posts, goals, connected accounts and their tokens.</li>
          <li>The phones signed in to the Retexia app.</li>
        </ul>
        <p className="type-body text-ink-muted">
          The Retexia team deletes the account after your request and emails you when it&apos;s done. Until then you can change your mind from the same place. We keep a short note in our records that the account was deleted, without its data.
        </p>
      </section>
    </main>
  );
}
