// Database types for the Retexia Supabase schema (supabase/migrations/0001_init.sql).
//
// Regenerate after changing the schema:
//   supabase gen types typescript --local > packages/supabase/src/database.types.ts
// (or --project-id <id> for the hosted project). Keep the helper types at the bottom.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      contact_messages: {
        Row: {
          business_name: string | null
          created_at: string
          email: string
          id: string
          message: string
          name: string
          phone: string | null
          product_id: string | null
          source_path: string | null
          status: string
          subject: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          phone?: string | null
          product_id?: string | null
          source_path?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          business_name?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          phone?: string | null
          product_id?: string | null
          source_path?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_messages_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          answer: string
          created_at: string
          id: string
          is_visible: boolean
          product_id: string | null
          question: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          is_visible?: boolean
          product_id?: string | null
          question: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          is_visible?: boolean
          product_id?: string | null
          question?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "faqs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      form_fields: {
        Row: {
          created_at: string
          default_value: string | null
          form_id: string | null
          help_text: string | null
          id: string
          is_visible: boolean
          key: string
          label: string
          max: number | null
          min: number | null
          options: Json
          placeholder: string | null
          prefill_from: string | null
          required: boolean
          show_if: Json | null
          sort_order: number
          step_id: string
          type: string
          updated_at: string
          width: string
        }
        Insert: {
          created_at?: string
          default_value?: string | null
          form_id?: string | null
          help_text?: string | null
          id?: string
          is_visible?: boolean
          key: string
          label: string
          max?: number | null
          min?: number | null
          options?: Json
          placeholder?: string | null
          prefill_from?: string | null
          required?: boolean
          show_if?: Json | null
          sort_order?: number
          step_id: string
          type: string
          updated_at?: string
          width?: string
        }
        Update: {
          created_at?: string
          default_value?: string | null
          form_id?: string | null
          help_text?: string | null
          id?: string
          is_visible?: boolean
          key?: string
          label?: string
          max?: number | null
          min?: number | null
          options?: Json
          placeholder?: string | null
          prefill_from?: string | null
          required?: boolean
          show_if?: Json | null
          sort_order?: number
          step_id?: string
          type?: string
          updated_at?: string
          width?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "form_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_fields_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_steps: {
        Row: {
          created_at: string
          description: string | null
          form_id: string
          id: string
          is_visible: boolean
          sort_order: number
          step_number: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          form_id: string
          id?: string
          is_visible?: boolean
          sort_order?: number
          step_number?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          form_id?: string
          id?: string
          is_visible?: boolean
          sort_order?: number
          step_number?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_steps_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          created_at: string
          description: string | null
          id: string
          product_id: string | null
          slug: string
          submit_label: string | null
          success_message: string | null
          success_title: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          product_id?: string | null
          slug: string
          submit_label?: string | null
          success_message?: string | null
          success_title?: string | null
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          product_id?: string | null
          slug?: string
          submit_label?: string | null
          success_message?: string | null
          success_title?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "forms_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      navigation_items: {
        Row: {
          created_at: string
          href: string | null
          id: string
          is_visible: boolean
          kind: string
          label: string
          location: string
          open_in_new_tab: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          href?: string | null
          id?: string
          is_visible?: boolean
          kind?: string
          label: string
          location: string
          open_in_new_tab?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          href?: string | null
          id?: string
          is_visible?: boolean
          kind?: string
          label?: string
          location?: string
          open_in_new_tab?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      order_counters: {
        Row: {
          last_value: number
          product_id: string
          year: number
        }
        Insert: {
          last_value?: number
          product_id: string
          year: number
        }
        Update: {
          last_value?: number
          product_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_counters_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          created_at: string
          created_by: string | null
          from_status: string | null
          id: string
          note: string | null
          order_id: string
          to_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          order_id: string
          to_status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          order_id?: string
          to_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_statuses: {
        Row: {
          created_at: string
          customer_can_cancel: boolean
          description: string | null
          is_final: boolean
          is_visible: boolean
          key: string
          label: string
          sort_order: number
          tone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_can_cancel?: boolean
          description?: string | null
          is_final?: boolean
          is_visible?: boolean
          key: string
          label: string
          sort_order?: number
          tone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_can_cancel?: boolean
          description?: string | null
          is_final?: boolean
          is_visible?: boolean
          key?: string
          label?: string
          sort_order?: number
          tone?: string
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          admin_note: string | null
          answers: Json
          billing_cycle: string
          cancelled_at: string | null
          created_at: string
          currency: string | null
          customer_note: string | null
          form_id: string | null
          form_version: number | null
          id: string
          package_id: string
          package_name: string | null
          price_amount: number | null
          product_id: string
          ref: string | null
          renews_at: string | null
          setup_fee: number | null
          starts_at: string | null
          status: string
          status_note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          answers?: Json
          billing_cycle?: string
          cancelled_at?: string | null
          created_at?: string
          currency?: string | null
          customer_note?: string | null
          form_id?: string | null
          form_version?: number | null
          id?: string
          package_id: string
          package_name?: string | null
          price_amount?: number | null
          product_id: string
          ref?: string | null
          renews_at?: string | null
          setup_fee?: number | null
          starts_at?: string | null
          status?: string
          status_note?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          admin_note?: string | null
          answers?: Json
          billing_cycle?: string
          cancelled_at?: string | null
          created_at?: string
          currency?: string | null
          customer_note?: string | null
          form_id?: string | null
          form_version?: number | null
          id?: string
          package_id?: string
          package_name?: string | null
          price_amount?: number | null
          product_id?: string
          ref?: string | null
          renews_at?: string | null
          setup_fee?: number | null
          starts_at?: string | null
          status?: string
          status_note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_status_fkey"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "order_statuses"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "orders_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      package_features: {
        Row: {
          created_at: string
          id: string
          included: boolean
          is_visible: boolean
          label: string
          package_id: string
          sort_order: number
          tooltip: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          included?: boolean
          is_visible?: boolean
          label: string
          package_id: string
          sort_order?: number
          tooltip?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          included?: boolean
          is_visible?: boolean
          label?: string
          package_id?: string
          sort_order?: number
          tooltip?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_features_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          badge: string | null
          created_at: string
          cta_label: string | null
          currency: string | null
          description: string | null
          fine_print: string | null
          id: string
          is_active: boolean
          is_featured: boolean
          is_visible: boolean
          name: string
          price_monthly: number
          price_note: string | null
          price_yearly: number | null
          product_id: string
          setup_fee: number
          slug: string
          sort_order: number
          tagline: string | null
          updated_at: string
        }
        Insert: {
          badge?: string | null
          created_at?: string
          cta_label?: string | null
          currency?: string | null
          description?: string | null
          fine_print?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          is_visible?: boolean
          name: string
          price_monthly?: number
          price_note?: string | null
          price_yearly?: number | null
          product_id: string
          setup_fee?: number
          slug: string
          sort_order?: number
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          badge?: string | null
          created_at?: string
          cta_label?: string | null
          currency?: string | null
          description?: string | null
          fine_print?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          is_visible?: boolean
          name?: string
          price_monthly?: number
          price_note?: string | null
          price_yearly?: number | null
          product_id?: string
          setup_fee?: number
          slug?: string
          sort_order?: number
          tagline?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packages_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      page_sections: {
        Row: {
          anchor: string | null
          background: string
          content: Json
          created_at: string
          eyebrow: string | null
          highlight: string | null
          id: string
          is_visible: boolean
          page_id: string
          sort_order: number
          subtitle: string | null
          title: string | null
          type: string
          updated_at: string
        }
        Insert: {
          anchor?: string | null
          background?: string
          content?: Json
          created_at?: string
          eyebrow?: string | null
          highlight?: string | null
          id?: string
          is_visible?: boolean
          page_id: string
          sort_order?: number
          subtitle?: string | null
          title?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          anchor?: string | null
          background?: string
          content?: Json
          created_at?: string
          eyebrow?: string | null
          highlight?: string | null
          id?: string
          is_visible?: boolean
          page_id?: string
          sort_order?: number
          subtitle?: string | null
          title?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_sections_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          created_at: string
          id: string
          is_published: boolean
          og_image_url: string | null
          product_id: string | null
          seo_description: string | null
          seo_title: string | null
          show_in_sitemap: boolean
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_published?: boolean
          og_image_url?: string | null
          product_id?: string | null
          seo_description?: string | null
          seo_title?: string | null
          show_in_sitemap?: boolean
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_published?: boolean
          og_image_url?: string | null
          product_id?: string | null
          seo_description?: string | null
          seo_title?: string | null
          show_in_sitemap?: boolean
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pages_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_features: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_visible: boolean
          product_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_visible?: boolean
          product_id: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_visible?: boolean
          product_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_features_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          code: string
          color_dark: string
          color_light: string
          color_soft_dark: string
          color_soft_light: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_visible: boolean
          name: string
          onboarding_form_id: string | null
          page_slug: string | null
          panel_live: boolean
          panel_url: string | null
          short_name: string
          slug: string
          sort_order: number
          status: string
          tagline: string | null
          updated_at: string
        }
        Insert: {
          code: string
          color_dark?: string
          color_light?: string
          color_soft_dark?: string
          color_soft_light?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_visible?: boolean
          name: string
          onboarding_form_id?: string | null
          page_slug?: string | null
          panel_live?: boolean
          panel_url?: string | null
          short_name: string
          slug: string
          sort_order?: number
          status?: string
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          color_dark?: string
          color_light?: string
          color_soft_dark?: string
          color_soft_light?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_visible?: boolean
          name?: string
          onboarding_form_id?: string | null
          page_slug?: string | null
          panel_live?: boolean
          panel_url?: string | null
          short_name?: string
          slug?: string
          sort_order?: number
          status?: string
          tagline?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_onboarding_form_id_fkey"
            columns: ["onboarding_form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          business_name: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          marketing_opt_in: boolean
          phone: string | null
          role: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          avatar_url?: string | null
          business_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          marketing_opt_in?: boolean
          phone?: string | null
          role?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          avatar_url?: string | null
          business_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          marketing_opt_in?: boolean
          phone?: string | null
          role?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      services: {
        Row: {
          created_at: string
          description: string | null
          href: string | null
          icon: string | null
          id: string
          is_visible: boolean
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          href?: string | null
          icon?: string | null
          id?: string
          is_visible?: boolean
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          href?: string | null
          icon?: string | null
          id?: string
          is_visible?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          address: string | null
          announcement_enabled: boolean
          announcement_href: string | null
          announcement_text: string | null
          auth_google_enabled: boolean
          auth_magic_link_enabled: boolean
          business_hours: string | null
          contact_email: string | null
          contact_phone: string | null
          copyright_text: string | null
          created_at: string
          currency_code: string
          currency_locale: string
          default_theme: string
          favicon_url: string | null
          footer_text: string | null
          id: number
          logo_dark_url: string | null
          logo_url: string | null
          maintenance_message: string | null
          maintenance_mode: boolean
          og_image_url: string | null
          seo_default_description: string | null
          seo_default_title: string | null
          seo_title_template: string
          site_name: string
          social_links: Json
          tagline: string | null
          theme: Json
          updated_at: string
          whatsapp_default_message: string | null
          whatsapp_number: string | null
        }
        Insert: {
          address?: string | null
          announcement_enabled?: boolean
          announcement_href?: string | null
          announcement_text?: string | null
          auth_google_enabled?: boolean
          auth_magic_link_enabled?: boolean
          business_hours?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          copyright_text?: string | null
          created_at?: string
          currency_code?: string
          currency_locale?: string
          default_theme?: string
          favicon_url?: string | null
          footer_text?: string | null
          id?: number
          logo_dark_url?: string | null
          logo_url?: string | null
          maintenance_message?: string | null
          maintenance_mode?: boolean
          og_image_url?: string | null
          seo_default_description?: string | null
          seo_default_title?: string | null
          seo_title_template?: string
          site_name?: string
          social_links?: Json
          tagline?: string | null
          theme?: Json
          updated_at?: string
          whatsapp_default_message?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          address?: string | null
          announcement_enabled?: boolean
          announcement_href?: string | null
          announcement_text?: string | null
          auth_google_enabled?: boolean
          auth_magic_link_enabled?: boolean
          business_hours?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          copyright_text?: string | null
          created_at?: string
          currency_code?: string
          currency_locale?: string
          default_theme?: string
          favicon_url?: string | null
          footer_text?: string | null
          id?: number
          logo_dark_url?: string | null
          logo_url?: string | null
          maintenance_message?: string | null
          maintenance_mode?: boolean
          og_image_url?: string | null
          seo_default_description?: string | null
          seo_default_title?: string | null
          seo_title_template?: string
          site_name?: string
          social_links?: Json
          tagline?: string | null
          theme?: Json
          updated_at?: string
          whatsapp_default_message?: string | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      site_strings: {
        Row: {
          created_at: string
          description: string | null
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          author_name: string
          author_role: string | null
          avatar_url: string | null
          company: string | null
          created_at: string
          id: string
          is_visible: boolean
          product_id: string | null
          quote: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          author_name: string
          author_role?: string | null
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          product_id?: string | null
          quote: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          author_name?: string
          author_role?: string | null
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          product_id?: string | null
          quote?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "testimonials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          product_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          product_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          product_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_privileged: { Args: never; Returns: boolean }
      request_role: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
