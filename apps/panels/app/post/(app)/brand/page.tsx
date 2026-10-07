import { Alert } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import { BrandForm } from "@/components/post/brand-form";
import { signPaths } from "@/lib/post/media";
import type { Brand } from "@/lib/post/post-db.types";
import { requireBusinessPage } from "@/lib/post/session";

export const metadata = { title: "Brand" };

export default async function BrandPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { business, db } = await requireBusinessPage("/brand");
  const brand = (business.brand ?? {}) as Brand;
  const logo = brand.logo_path ? (await signPaths(db, "media", [brand.logo_path])).get(brand.logo_path) ?? null : null;
  const tone = typeof brand.tone === "object" && brand.tone ? brand.tone : {};
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Brand" description="How your posts look and sound. The more you add, the less generic the posts." />
      {sp.welcome ? <Alert tone="success" title="Your business is set up">Now add your logo, colours and voice. Then your products, and we connect Facebook and Instagram.</Alert> : null}
      <BrandForm
        logoUrl={logo}
        initial={{
          colors: brand.colors ?? [],
          font: brand.font ?? "",
          template: brand.template ?? "",
          tone: { formal_casual: tone.formal_casual ?? 60, calm_energetic: tone.calm_energetic ?? 50 },
          emoji: brand.emoji ?? true,
          always_words: brand.always_words ?? [],
          never_words: brand.never_words ?? [],
          sample_posts: brand.sample_posts ?? [],
          contact: { phone: brand.contact?.phone ?? "", website: brand.contact?.website ?? "", address: brand.contact?.address ?? "", instagram: brand.contact?.instagram ?? "" },
          brand_brief: business.brand_brief ?? "",
        }}
      />
    </div>
  );
}
