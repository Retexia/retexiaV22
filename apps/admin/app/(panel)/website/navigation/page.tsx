import { Card } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import { NavigationEditor, type NavItemRow } from "@/components/website/content-editors";
import { requireStaffPage } from "@/lib/auth";

export const metadata = { title: "Navigation" };

const LOCATIONS: { key: NavItemRow["location"]; title: string; description: string }[] = [
  { key: "header", title: "Header", description: "Top menu. A “Products menu” item lists every visible product automatically; the button can change for signed-in visitors." },
  { key: "footer_products", title: "Footer: products", description: "First footer column." },
  { key: "footer_company", title: "Footer: company", description: "Second footer column." },
  { key: "footer_legal", title: "Footer: legal", description: "Small links at the very bottom." },
];

export default async function NavigationPage() {
  const { supabase } = await requireStaffPage("editContent");
  const { data } = await supabase.from("navigation_items").select("*").order("sort_order");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Navigation" description="Header and footer links. Drag to reorder." />
      {LOCATIONS.map((l) => (
        <Card key={l.key} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="type-h2 text-ink">{l.title}</h2>
            <p className="type-small text-ink-muted">{l.description}</p>
          </div>
          <NavigationEditor
            location={l.key}
            rows={(data ?? [])
              .filter((n) => n.location === l.key)
              .map((n) => ({
                id: n.id,
                location: l.key,
                kind: (["link", "button", "products_menu"].includes(n.kind) ? n.kind : "link") as NavItemRow["kind"],
                label: n.label,
                href: n.href ?? "",
                signed_in_label: n.signed_in_label ?? "",
                signed_in_href: n.signed_in_href ?? "",
                open_in_new_tab: n.open_in_new_tab,
                is_visible: n.is_visible,
              }))}
          />
        </Card>
      ))}
    </div>
  );
}
