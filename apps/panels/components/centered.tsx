import type { ReactNode } from "react";

export function Centered({ children, product = "post" }: { children: ReactNode; product?: "post" | "lingo" }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-sunk px-4 py-12">
      <div className="w-full max-w-lg">
        <p className="mb-6 text-center">
          <span className="font-display text-[22px] text-brand">Retexia</span>{" "}
          <span className="type-label" style={{ color: `var(--product-${product}, var(--rx-brand))` }}>
            {product === "lingo" ? "Lingo" : "Post"}
          </span>
        </p>
        {children}
      </div>
    </main>
  );
}
