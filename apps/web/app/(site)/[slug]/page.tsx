import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageView, pageMetadata } from "@/components/page-view";
import { RESERVED_SLUGS, getPublishedPages } from "@/lib/content";

const PLACEHOLDER = "__placeholder__";

export async function generateStaticParams() {
  const pages = await getPublishedPages();
  const params = pages.filter((p) => p.slug !== "").map((p) => ({ slug: p.slug }));
  // Cache Components needs at least one param to validate the route at build
  // time, even when Supabase is not reachable during the build.
  return params.length ? params : [{ slug: PLACEHOLDER }];
}

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  if (slug === PLACEHOLDER || RESERVED_SLUGS.has(slug)) return {};
  return pageMetadata(slug);
}

export default async function CmsPage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  if (slug === PLACEHOLDER || RESERVED_SLUGS.has(slug)) notFound();
  return <PageView slug={slug} />;
}
