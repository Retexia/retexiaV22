import { redirect } from "next/navigation";

/** Business details moved to /business (shared by every Feeder tool). */
export default function BusinessPage() {
  redirect("/business");
}
