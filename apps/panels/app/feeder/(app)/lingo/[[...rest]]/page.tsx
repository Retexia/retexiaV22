import { redirect } from "next/navigation";

/** Old links (feeder.retexia.com/lingo/…) → Lingo Feeder. */
export default async function OldLingo({ params }: { params: Promise<{ rest?: string[] }> }) {
  const { rest } = await params;
  const map: Record<string, string> = { inbox: "chats", test: "try", connect: "whatsapp", settings: "business" };
  const first = rest?.[0] ? (map[rest[0]] ?? rest[0]) : "";
  redirect(`/lingo-feeder${first && ["chats", "orders", "products", "business", "whatsapp", "try"].includes(first) ? `/${first}` : ""}`);
}
