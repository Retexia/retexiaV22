import { Skeleton } from "@retexia/ui";

export default function ReceiptLoading() {
  return (
    <div aria-busy="true" className="mx-auto flex max-w-[210mm] flex-col gap-4 px-4">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-10 w-48 self-end" />
      <Skeleton className="h-[60vh] w-full" />
    </div>
  );
}
