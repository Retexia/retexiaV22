/** Types for the "lingo" schema (supabase/migrations/0006_lingo_schema.sql), in `supabase gen types` format. */
export type Lang = "si" | "singlish" | "en" | "ta";
export type OrderStatus = "draft" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";

type Table<Row, Required extends keyof Row = never> = { Row: Row; Insert: Partial<Row> & Pick<Row, Required>; Update: Partial<Row>; Relationships: [] };

export type LingoUserRow = {
  id: number;
  owner_id: string | null;
  business_name: string;
  evolution_instance: string;
  evolution_base_url: string;
  evolution_apikey: string;
  owner_phone: string | null;
  staff_name: string | null;
  default_language: Lang;
  content_language: Lang;
  followup_hours: number;
  delivery_days: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};
export type BusinessDetailsRow = {
  id: number;
  lingo_user_id: number;
  business_type: string | null;
  about: string | null;
  address: string | null;
  location_url: string | null;
  opening_hours: string | null;
  contact_phone: string | null;
  website: string | null;
  delivery_areas: string | null;
  delivery_time: string | null;
  default_delivery_fee: number;
  payment_methods: string | null;
  extra_info: string | null;
  updated_at: string;
};
export type LingoProductRow = {
  id: number;
  lingo_user_id: number | null;
  product_name: string;
  short_description: string | null;
  long_description: string | null;
  price: number;
  delivery_fee: number | null;
  ingredients: string | null;
  application: string | null;
  precautions: string | null;
  symptoms: string | null;
  aliases: string | null;
  word_description: string | null;
  picture_url: string | null;
  product_id_feeder: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};
export type LingoCustomerRow = {
  id: number;
  lingo_user_id: number;
  remote_jid: string;
  number: string | null;
  whatsapp_name: string | null;
  customer_name: string | null;
  address: string | null;
  delivery_phone: string | null;
  language: Lang | null;
  selected_product: number | null;
  seen_products: number[];
  bot_paused: boolean;
  last_customer_msg_at: string | null;
  last_bot_msg_at: string | null;
  followup_due: boolean;
  created_at: string;
  updated_at: string;
};
export type LingoOrderRow = {
  id: number;
  lingo_user_id: number;
  customer_id: number;
  product_id: number | null;
  product_name: string | null;
  quantity: number;
  unit_price: number;
  delivery_fee: number;
  total_price: number | null;
  status: OrderStatus;
  customer_name: string | null;
  address: string | null;
  delivery_phone: string | null;
  cancel_reason: string | null;
  status_changed_at: string;
  created_at: string;
  updated_at: string;
};
export type MessageRow = {
  id: number;
  lingo_user_id: number;
  customer_id: number;
  role: "user" | "assistant" | "summary";
  content: string;
  quoted_text: string | null;
  media_type: string | null;
  wa_message_id: string | null;
  processed: boolean;
  created_at: string;
};
export type FixedMessageRow = { id: number; lingo_user_id: number | null; key: string; language: Lang; content: string; updated_at: string };

export type CustomerStats = {
  customer_id: number;
  user_messages: number;
  bot_messages: number;
  orders: number;
  confirmed_orders: number;
  spent: number;
  last_order_status: OrderStatus | null;
  last_order_at: string | null;
};
export type DailyStats = { day: string; customer_messages: number; active_customers: number; new_customers: number; orders: number; revenue: number };

export type LingoDatabase = {
  lingo: {
    Tables: {
      lingo_users: Table<LingoUserRow, "business_name" | "evolution_instance" | "evolution_base_url" | "evolution_apikey">;
      business_details: Table<BusinessDetailsRow, "lingo_user_id">;
      products: Table<LingoProductRow, "product_name">;
      customers: Table<LingoCustomerRow, "lingo_user_id" | "remote_jid">;
      orders: Table<LingoOrderRow, "lingo_user_id" | "customer_id">;
      messages: Table<MessageRow, "lingo_user_id" | "customer_id" | "role" | "content">;
      fixed_messages: Table<FixedMessageRow, "key" | "language" | "content">;
    };
    Views: { [_ in never]: never };
    Functions: {
      panel_customer_stats: { Args: { p_user: number }; Returns: CustomerStats[] };
      panel_daily_stats: { Args: { p_user: number; p_days: number }; Returns: DailyStats[] };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
