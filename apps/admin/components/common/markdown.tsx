import { cn } from "@retexia/ui";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Safe markdown (no raw HTML) for notes and previews. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("rx-prose rx-prose-sm", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}
