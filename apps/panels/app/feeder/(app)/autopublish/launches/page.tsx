import { Badge, Button, Card, EmptyState } from "@retexia/ui";
import { Rocket } from "lucide-react";
import Link from "next/link";
import { LAUNCH_STATE } from "@/components/feeder/autopublish/labels";
import { listLaunches, requireAutopublishPage } from "@/lib/feeder/autopublish/data";

export const metadata = { title: "Launches" };

export default async function LaunchesPage() {
  const { user } = await requireAutopublishPage("/autopublish/launches");
  const launches = await listLaunches(user.id, 100);
  if (!launches.length) {
    return (
      <Card>
        <EmptyState icon={<Rocket aria-hidden size={22} strokeWidth={1.5} />} title="No launches yet" actions={<Button href="/autopublish">Launch ads</Button>}>
          Every launch shows here with what was made, its review and anything that needs you.
        </EmptyState>
      </Card>
    );
  }
  return (
    <Card padded={false} className="overflow-x-auto">
      <table className="w-full min-w-[720px] type-body">
        <thead>
          <tr className="border-b border-line text-left type-small text-ink-muted">
            <th className="px-4 py-3 font-medium">Launch</th>
            <th className="px-4 py-3 font-medium">Product</th>
            <th className="px-4 py-3 font-medium">What was made</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {launches.map((l) => {
            const s = LAUNCH_STATE[l.state] ?? { label: l.state, tone: "neutral" as const };
            return (
              <tr key={l.ref} className="border-b border-line last:border-0 align-top">
                <td className="px-4 py-3">
                  <Link href={`/autopublish/launches/${l.ref}`} className="type-code text-brand underline-offset-4 hover:underline">
                    {l.ref}
                  </Link>
                  <span className="block type-small text-ink-muted">{new Date(l.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-ink">{l.product_name}</span>
                  <span className="block type-small text-ink-muted">Form name: {l.form_name}</span>
                </td>
                <td className="px-4 py-3 type-small text-ink-muted">
                  {l.summary}
                  {l.template_name ? <span className="block">Template: {l.template_name}</span> : null}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={s.tone}>{s.label}</Badge>
                  {l.problem ? <span className="mt-1 block max-w-xs type-small text-danger">{l.problem.message}</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
