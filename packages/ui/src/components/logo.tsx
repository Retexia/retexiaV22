import Link from "next/link";
import { cn } from "../cn";

/**
 * Site logo. Without an image the site name is set in Outfit 400 in brand blue.
 * With `src` (and optional `darkSrc`) the image is shown instead.
 */
export function Logo({
  name,
  src,
  darkSrc,
  href = "/",
  className,
  homeLabel,
}: {
  name: string;
  src?: string | null;
  darkSrc?: string | null;
  href?: string | null;
  className?: string;
  homeLabel?: string;
}) {
  const content = src ? (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- logo URL is set in Supabase */}
      <img src={src} alt={name} height={28} className={cn("h-7 w-auto", darkSrc && "dark:hidden")} />
      {darkSrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo URL is set in Supabase
        <img src={darkSrc} alt={name} height={28} className="hidden h-7 w-auto dark:block" />
      ) : null}
    </>
  ) : (
    <span className="font-display text-[22px] leading-none font-normal tracking-[-0.01em] text-brand">{name}</span>
  );
  if (!href) return <span className={cn("inline-flex items-center", className)}>{content}</span>;
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center rounded-sm focus-visible:focus-ring", className)}
      aria-label={homeLabel}
    >
      {content}
    </Link>
  );
}
