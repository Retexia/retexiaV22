"use client";

import { Button, Card, Checkbox, Field, Input, StatusBadge, Textarea, formatDate } from "@retexia/ui";
import { DescriptionList } from "@retexia/ui/admin";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { setOrderStatus, updateOrder } from "@/app/lingo/actions";
import type { LingoOrderRow, OrderStatus } from "@/lib/lingo/db.types";
import { ORDER_NEXT, ORDER_STATUS, money } from "@/lib/lingo/labels";

const ACTION_LABEL: Record<OrderStatus, string> = {
  draft: "Back to not confirmed",
  confirmed: "Confirm order",
  processing: "Packing",
  shipped: "Mark as sent",
  delivered: "Mark as delivered",
  cancelled: "Cancel order",
};

export function OrderPanel({
  order,
  customer,
  messages,
}: {
  order: LingoOrderRow;
  customer: { id: number; name: string; number: string | null; botPaused: boolean } | null;
  messages: Record<string, string>;
}) {
  const router = useRouter();
  const [next, setNext] = useState<OrderStatus | null>(null);
  const [notify, setNotify] = useState(true);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [edit, setEdit] = useState({
    quantity: String(order.quantity),
    delivery_fee: String(order.delivery_fee),
    customer_name: order.customer_name ?? "",
    address: order.address ?? "",
    delivery_phone: order.delivery_phone ?? "",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const s = ORDER_STATUS[order.status];
  const editDirty =
    edit.quantity !== String(order.quantity) ||
    edit.delivery_fee !== String(order.delivery_fee) ||
    edit.customer_name !== (order.customer_name ?? "") ||
    edit.address !== (order.address ?? "") ||
    edit.delivery_phone !== (order.delivery_phone ?? "");

  return (
    <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="type-h2 text-ink">Order #{order.id}</h2>
          <StatusBadge tone={s.tone} label={s.label} />
        </div>
        <DescriptionList
          columns={2}
          items={[
            { label: "Product", value: `${order.product_name ?? "—"} × ${order.quantity}` },
            { label: "Total", value: `${money(order.total_price)} (incl. ${money(order.delivery_fee)} delivery)` },
            { label: "Placed", value: formatDate(order.created_at, "en-LK", true) },
            { label: "Last change", value: formatDate(order.status_changed_at, "en-LK", true) },
            ...(order.cancel_reason ? [{ label: "Why cancelled", value: order.cancel_reason, wide: true }] : []),
          ]}
        />
        {customer ? (
          <div className="flex flex-wrap items-center gap-2 type-small">
            <Link href={`/customers/${customer.id}`} className="text-link">
              {customer.name}
            </Link>
            {customer.number ? (
              <a href={`https://wa.me/${customer.number}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link">
                <MessageCircle aria-hidden size={14} strokeWidth={1.5} /> Chat on WhatsApp
              </a>
            ) : null}
            {customer.botPaused ? <span className="text-warning">Lingo is stopped for this customer</span> : null}
          </div>
        ) : null}

        {ORDER_NEXT[order.status].length ? (
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <span className="type-label text-ink">Move this order</span>
            <div className="flex flex-wrap gap-2">
              {ORDER_NEXT[order.status].map((st) => (
                <Button
                  key={st}
                  size="sm"
                  variant={st === "cancelled" ? "ghost" : next === st ? "primary" : "secondary"}
                  className={st === "cancelled" ? "text-danger!" : undefined}
                  onClick={() => {
                    setNext(st);
                    setMessage(messages[st] ?? "");
                  }}
                >
                  {ACTION_LABEL[st]}
                </Button>
              ))}
            </div>
            {next ? (
              <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-sunk/50 p-3">
                {next === "cancelled" ? (
                  <Field label="Reason" optionalLabel="Optional">
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Out of stock" />
                  </Field>
                ) : null}
                <Checkbox label="Tell the customer on WhatsApp" checked={notify} onChange={(e) => setNotify(e.target.checked)} disabled={!customer} />
                {notify && customer ? (
                  <Field label="Message" hint="Sent from your WhatsApp number.">
                    <Textarea rows={3} value={message} maxLength={1500} onChange={(e) => setMessage(e.target.value)} />
                  </Field>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    loading={busy === "status"}
                    onClick={async () => {
                      setBusy("status");
                      const r = await setOrderStatus({ id: order.id, status: next, cancel_reason: reason || undefined, notify: notify && Boolean(customer) && Boolean(message.trim()), message });
                      setBusy(null);
                      toast[r.ok ? "success" : "error"](r.message ?? "");
                      if (r.ok) {
                        setNext(null);
                        router.refresh();
                      }
                    }}
                  >
                    {ACTION_LABEL[next]}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setNext(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-4">
        <h3 className="type-h3 text-ink">Delivery details</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={edit.customer_name} onChange={(e) => setEdit({ ...edit, customer_name: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={edit.delivery_phone} onChange={(e) => setEdit({ ...edit, delivery_phone: e.target.value })} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Textarea rows={2} value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
          </Field>
          <Field label="Quantity">
            <Input type="number" min={1} value={edit.quantity} onChange={(e) => setEdit({ ...edit, quantity: e.target.value })} />
          </Field>
          <Field label="Delivery charge (Rs.)">
            <Input type="number" min={0} value={edit.delivery_fee} onChange={(e) => setEdit({ ...edit, delivery_fee: e.target.value })} />
          </Field>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          disabled={!editDirty}
          loading={busy === "edit"}
          onClick={async () => {
            setBusy("edit");
            const r = await updateOrder({
              id: order.id,
              quantity: Number(edit.quantity) || 1,
              delivery_fee: Number(edit.delivery_fee) || 0,
              customer_name: edit.customer_name,
              address: edit.address,
              delivery_phone: edit.delivery_phone,
            });
            setBusy(null);
            toast[r.ok ? "success" : "error"](r.message ?? "");
            if (r.ok) router.refresh();
          }}
        >
          Save details
        </Button>
      </Card>
    </div>
  );
}
