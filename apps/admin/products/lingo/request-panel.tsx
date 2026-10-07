import { createAdminSchemaClient } from "@retexia/supabase/admin";
import { Card } from "@retexia/ui";
import type { RequestPanelContext } from "../registry";
import { LingoAccountControls, type LingoAccount } from "./account-controls";

/** Setup tab card: which WhatsApp bot this customer's Lingo panel shows. */
export async function LingoRequestPanel({ staff, orderId }: RequestPanelContext) {
  const { data: order } = await staff.supabase.from("staff_orders").select("user_id, customer_business, customer_whatsapp, customer_phone").eq("id", orderId).maybeSingle();
  const db = createAdminSchemaClient("lingo");
  const cols = "id, business_name, evolution_instance, owner_phone, active, owner_id";
  const [linked, free] = await Promise.all([
    order?.user_id ? db.from("lingo_users").select(cols).eq("owner_id", order.user_id).order("id") : Promise.resolve({ data: [], error: null }),
    db.from("lingo_users").select(cols).is("owner_id", null).order("business_name").limit(200),
  ]);
  const error = linked.error ?? free.error;
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="type-h2 text-ink">Lingo bot account</h2>
      {error ? (
        <p className="type-body text-danger">
          Can&apos;t read the Lingo database: {error.message}. Check that 0006_lingo_schema.sql has run and that <code>lingo</code> is in Supabase → Settings → API → Exposed schemas.
        </p>
      ) : !order?.user_id ? (
        <p className="type-body text-ink-muted">This request has no customer account yet, so there is nothing to connect.</p>
      ) : (
        <LingoAccountControls
          orderId={orderId}
          role={staff.role}
          linked={(linked.data ?? []) as LingoAccount[]}
          available={(free.data ?? []) as LingoAccount[]}
          defaults={{ business_name: order.customer_business ?? "", owner_phone: (order.customer_whatsapp || order.customer_phone || "").replace(/[^\d]/g, "") }}
        />
      )}
    </Card>
  );
}
