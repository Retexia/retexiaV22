import { redirect } from "next/navigation";

/** Ad accounts moved to Connections (shared by Autopublish and Auto comment). */
export default function AutopublishAccountsPage() {
  redirect("/connections#facebook");
}
