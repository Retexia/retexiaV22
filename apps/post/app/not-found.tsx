import { Button, Card } from "@retexia/ui";
import { Centered } from "@/components/centered";

export default function NotFound() {
  return (
    <Centered>
      <Card className="flex flex-col items-center gap-4 text-center">
        <h1 className="type-h1 text-ink">Not found</h1>
        <p className="type-body text-ink-muted">This page or post doesn&apos;t exist, or it belongs to another business.</p>
        <Button href="/">Back to today</Button>
      </Card>
    </Centered>
  );
}
