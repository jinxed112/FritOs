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
          vat_rate_eat_in: number
          vat_rate_takeaway: number
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
          vat_rate_eat_in?: number
          vat_rate_takeaway?: number
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
          vat_rate_eat_in?: number
          vat_rate_takeaway?: number
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
          order_type: 'kiosk' | 'counter' | 'pickup' | 'delivery'
          eat_in: boolean
          status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'refunded'
          customer_name: string | null
          customer_phone: string | null
          customer_email: string | null
          customer_id: string | null
          delivery_address_id: string | null
          delivery_notes: string | null
          delivery_fee: number
          scheduled_time: string | null
          prepared_at: string | null
          completed_at: string | null
          subtotal: number
          discount_amount: number
          vat_amount: number
          total: number
          promo_code_id: string | null
          promo_discount: number
          loyalty_points_earned: number
          loyalty_points_used: number
          loyalty_discount: number
          payment_method: 'card' | 'cash' | 'online' | 'mixed' | null
          payment_status: 'pending' | 'paid' | 'partial' | 'refunded' | 'failed'
          source_device_id: string | null
          created_by: string | null
          notes: string | null
          metadata: Json
          order_date: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          establishment_id: string
          order_number: string
          order_type: 'kiosk' | 'counter' | 'pickup' | 'delivery'
          eat_in?: boolean
          status?: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'refunded'
          customer_name?: string | null
          customer_phone?: string | null
          customer_email?: string | null
          customer_id?: string | null
          delivery_address_id?: string | null
          delivery_notes?: string | null
          delivery_fee?: number
          scheduled_time?: string | null
          prepared_at?: string | null
          completed_at?: string | null
          subtotal: number
          discount_amount?: number
          vat_amount?: number
          total: number
          promo_code_id?: string | null
          promo_discount?: number
          loyalty_points_earned?: number
          loyalty_points_used?: number
          loyalty_discount?: number
          payment_method?: 'card' | 'cash' | 'online' | 'mixed' | null
          payment_status?: 'pending' | 'paid' | 'partial' | 'refunded' | 'failed'
          source_device_id?: string | null
          created_by?: string | null
          notes?: string | null
          metadata?: Json
          order_date?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          establishment_id?: string
          order_number?: string
          order_type?: 'kiosk' | 'counter' | 'pickup' | 'delivery'
          eat_in?: boolean
          status?: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'refunded'
          customer_name?: string | null
          customer_phone?: string | null
          customer_email?: string | null
          customer_id?: string | null
          delivery_address_id?: string | null
          delivery_notes?: string | null
          delivery_fee?: number
          scheduled_time?: string | null
          prepared_at?: string | null
          completed_at?: string | null
          subtotal?: number
          discount_amount?: number
          vat_amount?: number
          total?: number
          promo_code_id?: string | null
          promo_discount?: number
          loyalty_points_earned?: number
          loyalty_points_used?: number
          loyalty_discount?: number
          payment_method?: 'card' | 'cash' | 'online' | 'mixed' | null
          payment_status?: 'pending' | 'paid' | 'partial' | 'refunded' | 'failed'
          source_device_id?: string | null
          created_by?: string | null
          notes?: string | null
          metadata?: Json
          order_date?: string
          created_at?: string
          updated_at?: string
        }
      }
      // ... autres tables (simplifiées pour commencer)
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_order_number: {
        Args: { p_establishment_id: string }
        Returns: string
      }
      get_product_allergens: {
        Args: { p_product_id: string }
        Returns: string[]
      }
      calculate_product_cost: {
        Args: { p_product_id: string }
        Returns: number
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

// Types pour les inserts
export type NewCategory = Database['public']['Tables']['categories']['Insert']
export type NewProduct = Database['public']['Tables']['products']['Insert']
export type NewOrder = Database['public']['Tables']['orders']['Insert']
