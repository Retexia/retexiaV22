import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Tiny renderer for short labels: [links](/terms) and **bold** only.
 * Works in Client Components without pulling in a markdown parser.
 */
export function InlineMarkdown({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    if (match[1] && match[2]) {
      const href = match[2];
      const internal = href.startsWith("/") && !href.startsWith("//");
      out.push(
        internal ? (
          <Link key={i++} href={href} target="_blank" className="text-link underline underline-offset-2 hover:text-brand-hover">
            {match[1]}
          </Link>
        ) : /^https?:\/\//.test(href) ? (
          <a key={i++} href={href} target="_blank" rel="noopener noreferrer" className="text-link underline underline-offset-2 hover:text-brand-hover">
            {match[1]}
          </a>
        ) : (
          match[1]
        ),
      );
    } else if (match[3]) {
      out.push(
        <strong key={i++} className="font-semibold text-ink">
          {match[3]}
        </strong>,
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
