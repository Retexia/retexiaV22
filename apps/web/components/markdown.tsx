import { cn } from "@retexia/ui";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  a({ href, children }) {
    const url = href ?? "";
    if (url.startsWith("/") && !url.startsWith("//")) return <Link href={url}>{children}</Link>;
    if (url.startsWith("#")) return <a href={url}>{children}</a>;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  // Content headings sit under the section title, so shift them down a level.
  h1: ({ children }) => <h2>{children}</h2>,
  h4: ({ children }) => <h3>{children}</h3>,
  img: ({ src, alt }) =>
    typeof src === "string" ? (
      // eslint-disable-next-line @next/next/no-img-element -- markdown images from Supabase storage
      <img src={src} alt={alt ?? ""} loading="lazy" className="rounded-lg border border-line" />
    ) : null,
};

/** Safe markdown (GFM, no raw HTML) for rich text fields from Supabase. */
export function Markdown({ children, className, size = "md" }: { children: string; className?: string; size?: "sm" | "md" }) {
  return (
    <div className={cn("rx-prose", size === "sm" && "rx-prose-sm", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}
