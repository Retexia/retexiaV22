import { Button, EmptyState } from "@retexia/ui";
import { SearchX } from "lucide-react";

export default function PanelNotFound() {
  return (
    <EmptyState icon={<SearchX aria-hidden size={24} strokeWidth={1.5} />} title="Not found" actions={<Button href="/">Back to the dashboard</Button>}>
      It may have been deleted, or the link is wrong.
    </EmptyState>
  );
}
