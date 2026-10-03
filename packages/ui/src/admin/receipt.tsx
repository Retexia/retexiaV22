import { cn } from "../cn";

export type ReceiptData = {
  business: { name: string; address?: string | null; logoUrl?: string | null; footer?: string | null; email?: string | null; phone?: string | null };
  number: string;
  /** Formatted date paid. */
  date: string;
  status: "confirmed" | "refunded" | string;
  customer: { name?: string | null; email?: string | null; phone?: string | null; business?: string | null };
  order: { ref: string; product: string; package: string; billing: string };
  items: { label: string; detail?: string | null; amount: string }[];
  total: string;
  method?: string | null;
  reference?: string | null;
  labels?: Partial<typeof defaultLabels>;
};

const defaultLabels = {
  receipt: "Receipt",
  number: "Receipt number",
  date: "Date paid",
  billedTo: "Billed to",
  request: "Request",
  item: "Description",
  amount: "Amount",
  total: "Total paid",
  method: "Payment method",
  reference: "Reference",
  paid: "Paid",
  refunded: "Refunded",
};

/**
 * Printable receipt (A4). The same component renders on admin.retexia.com
 * (/print/receipt/[id]) and on the customer's order page on retexia.com.
 * Use the browser's "Save as PDF".
 */
export function Receipt({ data, className }: { data: ReceiptData; className?: string }) {
  const l = { ...defaultLabels, ...data.labels };
  const refunded = data.status === "refunded";
  return (
    <article
      className={cn(
        "relative mx-auto flex w-full max-w-[210mm] flex-col gap-8 bg-white p-10 text-[#16264a] print:max-w-none print:p-0",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          {data.business.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo URL from settings, printed
            <img src={data.business.logoUrl} alt={data.business.name} className="mb-2 h-8 w-auto self-start" />
          ) : (
            <p className="font-display text-[24px] text-[#2a68d9]">{data.business.name}</p>
          )}
          {data.business.address ? <p className="text-[12px] whitespace-pre-line text-[#5a6884]">{data.business.address}</p> : null}
          <p className="text-[12px] text-[#5a6884]">{[data.business.email, data.business.phone].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="text-right">
          <h1 className="font-display text-[28px] font-light">{l.receipt}</h1>
          <p className="font-mono text-[13px]">{data.number}</p>
        </div>
      </header>

      <div
        aria-hidden
        className={cn(
          "absolute top-28 right-10 rotate-[-12deg] rounded-md border-4 px-4 py-1 font-display text-[32px] font-medium tracking-[0.1em] uppercase opacity-70",
          refunded ? "border-[#b42318] text-[#b42318]" : "border-[#1d7338] text-[#1d7338]",
        )}
      >
        {refunded ? l.refunded : l.paid}
      </div>

      <section className="grid grid-cols-2 gap-6 text-[13px]">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold tracking-[0.06em] text-[#5a6884] uppercase">{l.billedTo}</p>
          <p className="font-medium">{data.customer.business || data.customer.name}</p>
          {data.customer.business && data.customer.name ? <p>{data.customer.name}</p> : null}
          {data.customer.email ? <p>{data.customer.email}</p> : null}
          {data.customer.phone ? <p>{data.customer.phone}</p> : null}
        </div>
        <div className="flex flex-col gap-1 text-right">
          <p>
            <span className="text-[#5a6884]">{l.date}: </span>
            {data.date}
          </p>
          <p>
            <span className="text-[#5a6884]">{l.request}: </span>
            <span className="font-mono">{data.order.ref}</span>
          </p>
          <p>
            {data.order.product} · {data.order.package} · {data.order.billing}
          </p>
        </div>
      </section>

      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b-2 border-[#16264a] text-left">
            <th className="py-2 font-semibold">{l.item}</th>
            <th className="py-2 text-right font-semibold">{l.amount}</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i} className="border-b border-[#e4ebf5]">
              <td className="py-3">
                <p>{item.label}</p>
                {item.detail ? <p className="text-[12px] text-[#5a6884]">{item.detail}</p> : null}
              </td>
              <td className="py-3 text-right whitespace-nowrap">{item.amount}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="pt-4 text-right font-semibold">{l.total}</td>
            <td className="pt-4 text-right text-[16px] font-semibold whitespace-nowrap">{data.total}</td>
          </tr>
        </tfoot>
      </table>

      {data.method || data.reference ? (
        <p className="text-[12px] text-[#5a6884]">
          {data.method ? `${l.method}: ${data.method}` : ""}
          {data.method && data.reference ? " · " : ""}
          {data.reference ? `${l.reference}: ${data.reference}` : ""}
        </p>
      ) : null}

      {data.business.footer ? (
        <footer className="mt-auto border-t border-[#e4ebf5] pt-4 text-[11px] whitespace-pre-line text-[#5a6884]">{data.business.footer}</footer>
      ) : null}
    </article>
  );
}
