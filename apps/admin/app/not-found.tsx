import { Button, EmptyState } from "@retexia/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-sunk px-6">
      <EmptyState title="Page not found" actions={<Button href="/">Go to the dashboard</Button>}>
        The link may be old or mistyped.
      </EmptyState>
    </main>
  );
}
