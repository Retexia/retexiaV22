import { Badge, Button, Card, EmptyState } from "@retexia/ui";
import { LayoutTemplate, Plus } from "lucide-react";
import Link from "next/link";
import { TemplateActions } from "@/components/feeder/autopublish/template-actions";
import { getAccount, listTemplates, requireAutopublishPage } from "@/lib/feeder/autopublish/data";
import { objectiveLabel, PLATFORM_LONG, presetLabel, sampleSummaries } from "@/lib/feeder/autopublish/plan";

export const metadata = { title: "Autopublish templates" };

export default async function AutopublishTemplatesPage() {
  const { user } = await requireAutopublishPage("/autopublish/templates");
  const [templates, account] = await Promise.all([listTemplates(user.id), getAccount(user.id)]);
  const currency = account?.currency ?? "LKR";
  if (!templates.length) {
    return (
      <Card>
        <EmptyState
          icon={<LayoutTemplate aria-hidden size={22} strokeWidth={1.5} />}
          title="Make your first template"
          actions={
            <Button href="/autopublish/templates/new">
              <Plus aria-hidden size={16} strokeWidth={1.75} /> New template
            </Button>
          }
        >
          A template is how a launch is set up: where it runs, the layout, budget, audience, ad text and lead form. Make it once, then launch with a few clicks every day.
        </EmptyState>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button href="/autopublish/templates/new">
          <Plus aria-hidden size={16} strokeWidth={1.75} /> New template
        </Button>
      </div>
      <ul className="grid gap-4 md:grid-cols-2">
        {templates.map((t) => {
          const three = sampleSummaries(t.data, currency)[1]!;
          return (
            <Card as="li" key={t.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link href={`/autopublish/templates/${t.id}`} className="type-h3 text-ink underline-offset-4 hover:underline">
                  {t.data.name}
                </Link>
                <span className="type-small text-ink-muted">v{t.version}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {t.data.platforms.map((p) => (
                  <Badge key={p} tone="brand">
                    {PLATFORM_LONG[p]}
                  </Badge>
                ))}
                <Badge tone="neutral">{objectiveLabel(t.data.objective)}</Badge>
                <Badge tone="neutral">{presetLabel(t.data.structure.preset)}</Badge>
              </div>
              <p className="type-small text-ink-muted">
                With 3 creatives: <span className="text-ink">{three.errors.length ? three.errors[0]!.message : three.summary}</span>
              </p>
              <div className="mt-auto flex flex-wrap gap-1 pt-1">
                <Button href={`/autopublish?template=${t.id}`} size="sm">
                  Launch with it
                </Button>
                <Button href={`/autopublish/templates/${t.id}`} size="sm" variant="secondary">
                  Edit
                </Button>
                <TemplateActions id={t.id} name={t.data.name} />
              </div>
            </Card>
          );
        })}
      </ul>
    </div>
  );
}
