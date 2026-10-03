import { Container, Skeleton } from "@retexia/ui";

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="py-12 md:py-24">
      <span className="sr-only">Loading</span>
      <Container className="flex flex-col items-center gap-4">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-12 w-full max-w-[560px]" />
        <Skeleton className="h-12 w-full max-w-[420px]" />
        <Skeleton className="mt-2 h-5 w-full max-w-[480px]" />
        <div className="mt-6 flex gap-3">
          <Skeleton className="h-12 w-36 rounded-full" />
          <Skeleton className="h-12 w-32 rounded-full" />
        </div>
        <Skeleton className="mt-16 h-80 w-full max-w-[340px] rounded-[28px]" />
      </Container>
    </div>
  );
}
