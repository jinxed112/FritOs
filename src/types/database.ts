export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      establishments: {
        Row: {
          id: string
          name: string
          slug: string
          address: string | null
          city: string | null
          postal_code: string | null
          phone: string | null
          email: string | null
          vat_number: string | null
          is_active: boolean
          sce_enabled: boolean
          sce_config: Json
          settings: Json
          opening_hours: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          address?: string | null
          city?: string | null
          postal_code?: string | null
          phone?: string | null
          email?: string | null
          vat_number?: string | null
          is_active?: boolean
          sce_enabled?: boolean
          sce_config?: Json
          settings?: Json
          opening_hours?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          address?: string | null
          city?: string | null
          postal_code?: string | null
          phone?: string | null
          email?: string | null
          vat_number?: string | null
          is_active?: boolean
          sce_enabled?: boolean
          sce_config?: Json
          settings?: Json
          opening_hours?: Json
          created_at?: string
          updated_at?: string
        }
      }
      categories: {
        Row: {
          id: string
          establishment_id: string
          name: string
          slug: string
          description: string | null
          image_url: string | null
          display_order: number
          is_active: boolean
          visible_on_kiosk: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          establishment_id: string
          name: string
          slug: string
          description?: string | null
          image_url?: string | null
          display_order?: number
          is_active?: boolean
          visible_on_kiosk?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          establishment_id?: string
          name?: string
          slug?: string
          description?: string | null
          image_url?: string | null
          display_order?: number
          is_active?: boolean
          visible_on_kiosk?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      products: {
        Row: {
          id: string
          establishment_id: string
          category_id: string
          name: string
          slug: string
          description: string | null
          image_url: string | null
          price: number
          vat_eat_in: number
          vat_takeaway: number
          cost_price: number | null
          display_order: number
          is_available: boolean
          is_active: boolean
          is_menu: boolean
          menu_config: Json
          preparation_time: number
          allergens_override: string[] | null
          tags: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          establishment_id: string
          category_id: string
          name: string
          slug: string
          description?: string | null
          image_url?: string | null
          price: number
          vat_eat_in?: number
          vat_takeaway?: number
          cost_price?: number | null
          display_order?: number
          is_available?: boolean
          is_active?: boolean
          is_menu?: boolean
          menu_config?: Json
          preparation_time?: number
          allergens_override?: string[] | null
          tags?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          establishment_id?: string
          category_id?: string
          name?: string
          slug?: string
          description?: string | null
          image_url?: string | null
          price?: number
          vat_eat_in?: number
          vat_takeaway?: number
          cost_price?: number | null
          display_order?: number
          is_available?: boolean
          is_active?: boolean
          is_menu?: boolean
          menu_config?: Json
          preparation_time?: number
          allergens_override?: string[] | null
          tags?: string[]
          created_at?: string
          updated_at?: string
        }
      }
      orders: {
        Row: {
          id: string
          establishment_id: string
          order_number: string
          order_type: 'kiosk' | 'counter' | 'pickup' | 'delivery' | 'eat_in' | 'takeaway'
          status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'refunded'
          customer_name: string | null
          customer_phone: string | null
          customer_email: string | null
          customer_id: string | null
          subtotal: number
          discount_amount: number
          tax_amount: number
          total_amount: number
          payment_method: 'card' | 'cash' | 'online' | 'mixed' | null
          payment_status: 'pending' | 'paid' | 'partial' | 'refunded' | 'failed'
          source: string | null
          source_device_id: string | null
          created_by: string | null
          notes: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          establishment_id: string
          order_number?: string
          order_type: 'kiosk' | 'counter' | 'pickup' | 'delivery' | 'eat_in' | 'takeaway'
          status?: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'refunded'
          customer_name?: string | null
          customer_phone?: string | null
          customer_email?: string | null
          customer_id?: string | null
          subtotal: number
          discount_amount?: number
          tax_amount?: number
          total_amount: number
          payment_method?: 'card' | 'cash' | 'online' | 'mixed' | null
          payment_status?: 'pending' | 'paid' | 'partial' | 'refunded' | 'failed'
          source?: string | null
          source_device_id?: string | null
          created_by?: string | null
          notes?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          establishment_id?: string
          order_number?: string
          order_type?: 'kiosk' | 'counter' | 'pickup' | 'delivery' | 'eat_in' | 'takeaway'
          status?: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'refunded'
          customer_name?: string | null
          customer_phone?: string | null
          customer_email?: string | null
          customer_id?: string | null
          subtotal?: number
          discount_amount?: number
          tax_amount?: number
          total_amount?: number
          payment_method?: 'card' | 'cash' | 'online' | 'mixed' | null
          payment_status?: 'pending' | 'paid' | 'partial' | 'refunded' | 'failed'
          source?: string | null
          source_device_id?: string | null
          created_by?: string | null
          notes?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          unit_price: number
          vat_rate: number
          options_selected: string | null
          options_total: number
          line_total: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          unit_price: number
          vat_rate?: number
          options_selected?: string | null
          options_total?: number
          line_total?: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit_price?: number
          vat_rate?: number
          options_selected?: string | null
          options_total?: number
          line_total?: number
          notes?: string | null
          created_at?: string
        }
      }
      z_reports: {
        Row: {
          id: string
          establishment_id: string
          report_number: number
          period_start: string
          period_end: string
          orders_count: number
          total_ht: number
          total_tva: number
          total_ttc: number
          eat_in_count: number
          eat_in_total: number
          takeaway_count: number
          takeaway_total: number
          cash_count: number
          cash_total: number
          card_count: number
          card_total: number
          vat_breakdown: Json
          source_breakdown: Json
          top_products: Json
          closed_by: string | null
          closed_at: string
          created_at: string
        }
        Insert: {
          id?: string
          establishment_id: string
          report_number: number
          period_start: string
          period_end: string
          orders_count?: number
          total_ht?: number
          total_tva?: number
          total_ttc?: number
          eat_in_count?: number
          eat_in_total?: number
          takeaway_count?: number
          takeaway_total?: number
          cash_count?: number
          cash_total?: number
          card_count?: number
          card_total?: number
          vat_breakdown?: Json
          source_breakdown?: Json
          top_products?: Json
          closed_by?: string | null
          closed_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          establishment_id?: string
          report_number?: number
          period_start?: string
          period_end?: string
          orders_count?: number
          total_ht?: number
          total_tva?: number
          total_ttc?: number
          eat_in_count?: number
          eat_in_total?: number
          takeaway_count?: number
          takeaway_total?: number
          cash_count?: number
          cash_total?: number
          card_count?: number
          card_total?: number
          vat_breakdown?: Json
          source_breakdown?: Json
          top_products?: Json
          closed_by?: string | null
          closed_at?: string
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_order_number: {
        Args: { p_establishment_id: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// Types utilitaires
export type Establishment = Database['public']['Tables']['establishments']['Row']
export type Category = Database['public']['Tables']['categories']['Row']
export type Product = Database['public']['Tables']['products']['Row']
export type Order = Database['public']['Tables']['orders']['Row']
export type OrderItem = Database['public']['Tables']['order_items']['Row']
export type ZReport = Database['public']['Tables']['z_reports']['Row']
