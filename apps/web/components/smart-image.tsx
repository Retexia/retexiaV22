import Image, { type ImageProps } from "next/image";

/**
 * next/image for Supabase storage and local files; other hosts (pasted into
 * Supabase by hand) are shown without optimisation instead of erroring.
 */
export function SmartImage(props: ImageProps) {
  const src = typeof props.src === "string" ? props.src : "";
  let optimizable = !src || src.startsWith("/");
  if (!optimizable) {
    try {
      const host = new URL(src).hostname;
      const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : "";
      optimizable = host.endsWith(".supabase.co") || host === supabaseHost;
    } catch {
      optimizable = false;
    }
  }
  return <Image {...props} alt={props.alt} unoptimized={props.unoptimized ?? !optimizable} />;
}
