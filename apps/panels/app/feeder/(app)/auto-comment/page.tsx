import { Badge } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import { AutoCommentPanel } from "@/components/feeder/auto-comment/auto-comment-panel";
import { commentStats, getCommentStatus, listCommentLog, requireAutoCommentPage } from "@/lib/feeder/auto-comment/data";

export const metadata = { title: "Auto comment" };
/** Its buttons talk to Facebook (and the AI) several times: give them time. */
export const maxDuration = 60;

/** feeder.retexia.com/auto-comment: replies to, hides and messages the comments on the customer's ads and Page posts (free). */
export default async function AutoCommentPage() {
  const { user } = await requireAutoCommentPage("/auto-comment");
  const [status, log, stats] = await Promise.all([getCommentStatus(user.id), listCommentLog(user.id, 50).catch(() => []), commentStats(user.id).catch(() => null)]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Auto comment"
        chips={<Badge tone="success">Free</Badge>}
        description="Every comment on your Facebook ads and Page posts gets an answer within a minute: a reply under it, a private message with the details, and phone numbers, links and bad words hidden."
      />
      <AutoCommentPanel status={status} log={log} stats={stats ?? { replied: 0, private: 0, hidden: 0, first: 0 }} />
    </div>
  );
}
