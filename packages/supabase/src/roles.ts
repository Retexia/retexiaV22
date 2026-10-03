/**
 * Retexia team roles and what each may do. The admin UI hides what a role
 * can't do; server actions check with requireRole() and the database enforces
 * the same rules with RLS and role-checked RPCs.
 */
export const STAFF_ROLES = ["support", "editor", "admin", "owner"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export type Role = "customer" | StaffRole;

export const capabilities = {
  /** Dashboard, requests and customers (read). */
  view: ["support", "editor", "admin", "owner"],
  /** Change request status, notes, payments, product actions. */
  operate: ["support", "admin", "owner"],
  /** Website content: pages, sections, media, strings, navigation. */
  editContent: ["editor", "admin", "owner"],
  /** Products, packages, forms, service fields, actions. */
  manageProducts: ["admin", "owner"],
  /** Edit customers, invite, ban, reset links. */
  manageCustomers: ["admin", "owner"],
  /** Override prices, delete records, site settings, theme, statuses. */
  manageSettings: ["admin", "owner"],
  /** Team, integrations secrets, deleting users. */
  manageTeam: ["owner"],
} as const satisfies Record<string, readonly StaffRole[]>;

export type Capability = keyof typeof capabilities;

export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return Boolean(role && (STAFF_ROLES as readonly string[]).includes(role));
}

export function can(role: string | null | undefined, capability: Capability): boolean {
  return Boolean(role && (capabilities[capability] as readonly string[]).includes(role));
}

export const roleLabels: Record<Role, string> = {
  customer: "Customer",
  support: "Support",
  editor: "Editor",
  admin: "Admin",
  owner: "Owner",
};
