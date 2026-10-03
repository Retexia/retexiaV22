import { Container } from "@retexia/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StyleguideDemo } from "@/components/styleguide-demo";
import { getProducts } from "@/lib/content";

export const metadata: Metadata = { title: "Styleguide", robots: { index: false } };

/** Every design-system component in one place. Development only (/_styleguide). */
export default async function StyleguidePage() {
  if (process.env.NODE_ENV === "production") notFound();
  const products = await getProducts();
  return (
    <main id="main" className="py-12">
      <Container>
        <StyleguideDemo productSlugs={products.map((p) => p.slug)} />
      </Container>
    </main>
  );
}
