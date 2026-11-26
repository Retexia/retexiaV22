import { appProducts, unreadCount } from "@/lib/app/access";
import { appRoute } from "@/lib/app/http";

/** The signed-in person, what they can open in the app (the panels' access rule) and unread notifications. */
export const GET = appRoute(async (_request, user) => {
  const [{ data: profile }, products, unread, { data: deletion }] = await Promise.all([
    user.sb.from("profiles").select("full_name, email, phone, whatsapp, business_name").eq("id", user.id).maybeSingle(),
    appProducts(user),
    unreadCount(user),
    user.sb.from("account_deletion_requests").select("created_at").eq("user_id", user.id).eq("status", "pending").maybeSingle(),
  ]);
  return {
    user: {
      id: user.id,
      email: profile?.email ?? user.email,
      name: profile?.full_name ?? "",
      business: profile?.business_name ?? null,
      phone: profile?.whatsapp ?? profile?.phone ?? null,
    },
    products,
    unread,
    deletionRequestedAt: deletion?.created_at ?? null,
  };
});
