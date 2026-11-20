"use client";

import { Select } from "@retexia/ui";
import { setAdProduct } from "@/app/feeder/(app)/lingo/actions";
import { useAction } from "./common";

export function AdProductSelect({ adId, productId, products, label }: { adId: string; productId: number | null; products: { id: number; name: string }[]; label: string }) {
  const { pending, go } = useAction();
  return (
    <Select
      aria-label={label}
      disabled={pending}
      value={productId ? String(productId) : ""}
      placeholder="Pick the product"
      options={products.map((p) => ({ value: String(p.id), label: p.name }))}
      onChange={(e) => go(() => setAdProduct({ ad_id: adId, product_id: e.target.value ? Number(e.target.value) : null }))}
    />
  );
}
