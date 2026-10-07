import { Skeleton } from "@retexia/ui";

export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="aspect-[4/5] w-full rounded-lg" />
        <Skeleton className="aspect-[4/5] w-full rounded-lg" />
        <Skeleton className="aspect-[4/5] w-full rounded-lg" />
      </div>
    </div>
  );
}
