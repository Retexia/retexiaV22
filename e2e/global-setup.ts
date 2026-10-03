import { createUser } from "./helpers";

/** Team members and customers used by the tests (fresh database each run). */
export default async function globalSetup() {
  await createUser("owner@e2e.test", "owner", { name: "Olivia Owner", mfa: true });
  await createUser("admin@e2e.test", "admin", { name: "Adam Admin", mfa: true });
  await createUser("editor@e2e.test", "editor", { name: "Eddie Editor", mfa: true });
  await createUser("support@e2e.test", "support", { name: "Sam Support" });
  await createUser("customer@e2e.test", "customer", { name: "Chamari Perera" });
}
