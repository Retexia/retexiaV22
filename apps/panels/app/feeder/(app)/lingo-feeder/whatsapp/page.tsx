import { redirect } from "next/navigation";

/** The WhatsApp number moved to Connections (one place for every account). */
export default function WhatsAppPage() {
  redirect("/connections#whatsapp");
}
