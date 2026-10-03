import { Card, Skeleton } from "@retexia/ui";

export function AuthSkeleton() {
  return (
    <Card className="flex flex-col gap-5 p-6 sm:p-8" aria-busy="true">
      <Skeleton className="mx-auto h-8 w-40" />
      <Skeleton className="mx-auto h-4 w-56" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-12 w-full rounded-full" />
    </Card>
  );
}
