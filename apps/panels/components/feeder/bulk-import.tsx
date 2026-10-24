"use client";

import { Button, Card } from "@retexia/ui";
import { Boxes } from "lucide-react";

/** Where prices, item codes and delivery fees come from: the customer's products and form names. */
export function ProductsCard({ count }: { count: number }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="type-h3 text-ink">Your products</h2>
        <p className="type-body text-ink-muted">
          {count
            ? `${count} product${count === 1 ? "" : "s"} with your form names. Each lead from those forms gets that product's item code, your price and the delivery fee. A new form? Add its name there first.`
            : "Add the products you sell and your form names for each, so every lead lands on the right product, item code and price."}
        </p>
      </div>
      <Button href="/products" variant={count ? "secondary" : "primary"} icon={<Boxes aria-hidden size={16} strokeWidth={1.5} />}>
        {count ? "My products" : "Add my products"}
      </Button>
    </Card>
  );
}

/** Saves the courier CSV the worker sent back to this computer. */
export async function downloadCsv(res: Response) {
  const blob = await res.blob();
  const name = decodeURIComponent(/filename="?([^";]+)"?/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "orders.csv");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { fileName: name, orders: res.headers.get("x-feeder-orders"), summary: decodeURIComponent(res.headers.get("x-feeder-summary") ?? "").split("\n").filter(Boolean) };
}
