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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          allow_early_clockin_minutes: number
          auto_checkout_enabled: boolean
          auto_clockout_grace_minutes: number
          checkin_radius_m: number
          daily_active_hours: number | null
          daily_visit_target: number | null
          daily_working_hours: number | null
          id: boolean
          idle_alert_threshold_minutes: number
          late_clockin_threshold_minutes: number
          location_ping_interval_minutes: number
          max_location_accuracy_m: number
          primary_currency: Database["public"]["Enums"]["currency"]
          short_visit_threshold_minutes: number
          updated_at: string
          updated_by: string | null
          weekly_active_hours: number | null
          weekly_visit_target: number | null
          weekly_working_hours: number | null
          work_end_time: string
          work_start_time: string
        }
        Insert: {
          allow_early_clockin_minutes?: number
          auto_checkout_enabled?: boolean
          auto_clockout_grace_minutes?: number
          checkin_radius_m?: number
          daily_active_hours?: number | null
          daily_visit_target?: number | null
          daily_working_hours?: number | null
          id?: boolean
          idle_alert_threshold_minutes?: number
          late_clockin_threshold_minutes?: number
          location_ping_interval_minutes?: number
          max_location_accuracy_m?: number
          primary_currency?: Database["public"]["Enums"]["currency"]
          short_visit_threshold_minutes?: number
          updated_at?: string
          updated_by?: string | null
          weekly_active_hours?: number | null
          weekly_visit_target?: number | null
          weekly_working_hours?: number | null
          work_end_time?: string
          work_start_time?: string
        }
        Update: {
          allow_early_clockin_minutes?: number
          auto_checkout_enabled?: boolean
          auto_clockout_grace_minutes?: number
          checkin_radius_m?: number
          daily_active_hours?: number | null
          daily_visit_target?: number | null
          daily_working_hours?: number | null
          id?: boolean
          idle_alert_threshold_minutes?: number
          late_clockin_threshold_minutes?: number
          location_ping_interval_minutes?: number
          max_location_accuracy_m?: number
          primary_currency?: Database["public"]["Enums"]["currency"]
          short_visit_threshold_minutes?: number
          updated_at?: string
          updated_by?: string | null
          weekly_active_hours?: number | null
          weekly_visit_target?: number | null
          weekly_working_hours?: number | null
          work_end_time?: string
          work_start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          auto_clocked_out: boolean
          clock_in_accuracy_m: number | null
          clock_in_at: string
          clock_in_latitude: number
          clock_in_location_id: string | null
          clock_in_longitude: number
          clock_in_selfie_path: string
          clock_out_accuracy_m: number | null
          clock_out_at: string | null
          clock_out_latitude: number | null
          clock_out_location_id: string | null
          clock_out_longitude: number | null
          clock_out_selfie_path: string | null
          created_at: string
          flags: string[]
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_clocked_out?: boolean
          clock_in_accuracy_m?: number | null
          clock_in_at?: string
          clock_in_latitude: number
          clock_in_location_id?: string | null
          clock_in_longitude: number
          clock_in_selfie_path: string
          clock_out_accuracy_m?: number | null
          clock_out_at?: string | null
          clock_out_latitude?: number | null
          clock_out_location_id?: string | null
          clock_out_longitude?: number | null
          clock_out_selfie_path?: string | null
          created_at?: string
          flags?: string[]
          id?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          auto_clocked_out?: boolean
          clock_in_accuracy_m?: number | null
          clock_in_at?: string
          clock_in_latitude?: number
          clock_in_location_id?: string | null
          clock_in_longitude?: number
          clock_in_selfie_path?: string
          clock_out_accuracy_m?: number | null
          clock_out_at?: string | null
          clock_out_latitude?: number | null
          clock_out_location_id?: string | null
          clock_out_longitude?: number | null
          clock_out_selfie_path?: string | null
          created_at?: string
          flags?: string[]
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_clock_in_location_id_fkey"
            columns: ["clock_in_location_id"]
            isOneToOne: false
            referencedRelation: "work_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_clock_out_location_id_fkey"
            columns: ["clock_out_location_id"]
            isOneToOne: false
            referencedRelation: "work_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string | null
          actor_name: string | null
          changed: string[]
          id: number
          new_row: Json | null
          occurred_at: string
          old_row: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          actor_name?: string | null
          changed?: string[]
          id?: never
          new_row?: Json | null
          occurred_at?: string
          old_row?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          actor_name?: string | null
          changed?: string[]
          id?: never
          new_row?: Json | null
          occurred_at?: string
          old_row?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          logo_path: string | null
          name: string
          sheet_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          logo_path?: string | null
          name: string
          sheet_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          logo_path?: string | null
          name?: string
          sheet_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      cart_lines: {
        Row: {
          cart_id: string
          created_at: string
          discount_amount: number
          discount_mode: Database["public"]["Enums"]["discount_mode"]
          discount_percent: number
          free_quantity: number
          id: string
          item_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          discount_amount?: number
          discount_mode?: Database["public"]["Enums"]["discount_mode"]
          discount_percent?: number
          free_quantity?: number
          id?: string
          item_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          discount_amount?: number
          discount_mode?: Database["public"]["Enums"]["discount_mode"]
          discount_percent?: number
          free_quantity?: number
          id?: string
          item_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_lines_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          customer_id: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contacts: {
        Row: {
          active: boolean
          created_at: string
          customer_id: string
          id: string
          is_primary: boolean
          name: string
          phone: string | null
          position: string | null
          sheet_id: string | null
          sort_order: number
          telegram_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          customer_id: string
          id?: string
          is_primary?: boolean
          name: string
          phone?: string | null
          position?: string | null
          sheet_id?: string | null
          sort_order?: number
          telegram_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          customer_id?: string
          id?: string
          is_primary?: boolean
          name?: string
          phone?: string | null
          position?: string | null
          sheet_id?: string | null
          sort_order?: number
          telegram_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_pictures: {
        Row: {
          active: boolean
          created_at: string
          customer_id: string
          description: string | null
          id: string
          is_primary: boolean
          photo_path: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          customer_id: string
          description?: string | null
          id?: string
          is_primary?: boolean
          photo_path: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          customer_id?: string
          description?: string | null
          id?: string
          is_primary?: boolean
          photo_path?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_pictures_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_pictures_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          business_type: string | null
          code: string | null
          commune_text: string | null
          created_at: string
          created_by: string | null
          credit_limit_usd: number | null
          district_text: string | null
          id: string
          landmark: string | null
          last_purchase_date: string | null
          last_visit_date: string | null
          latitude: number | null
          longitude: number | null
          owner_id: string | null
          province_code: string | null
          province_text: string | null
          remarks: string | null
          sheet_id: string | null
          shop_name: string
          status: Database["public"]["Enums"]["customer_status"]
          status_note: string | null
          street_address: string | null
          updated_at: string
          zipcode: string | null
        }
        Insert: {
          business_type?: string | null
          code?: string | null
          commune_text?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit_usd?: number | null
          district_text?: string | null
          id?: string
          landmark?: string | null
          last_purchase_date?: string | null
          last_visit_date?: string | null
          latitude?: number | null
          longitude?: number | null
          owner_id?: string | null
          province_code?: string | null
          province_text?: string | null
          remarks?: string | null
          sheet_id?: string | null
          shop_name: string
          status?: Database["public"]["Enums"]["customer_status"]
          status_note?: string | null
          street_address?: string | null
          updated_at?: string
          zipcode?: string | null
        }
        Update: {
          business_type?: string | null
          code?: string | null
          commune_text?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit_usd?: number | null
          district_text?: string | null
          id?: string
          landmark?: string | null
          last_purchase_date?: string | null
          last_visit_date?: string | null
          latitude?: number | null
          longitude?: number | null
          owner_id?: string | null
          province_code?: string | null
          province_text?: string | null
          remarks?: string | null
          sheet_id?: string | null
          shop_name?: string
          status?: Database["public"]["Enums"]["customer_status"]
          status_note?: string | null
          street_address?: string | null
          updated_at?: string
          zipcode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_province_code_fkey"
            columns: ["province_code"]
            isOneToOne: false
            referencedRelation: "geo_provinces"
            referencedColumns: ["code"]
          },
        ]
      }
      departments: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          sheet_id: string | null
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          sheet_id?: string | null
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          sheet_id?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      geo_communes: {
        Row: {
          code: string
          district_code: string
          name: string
          name_alt: string | null
          sheet_id: string | null
        }
        Insert: {
          code: string
          district_code: string
          name: string
          name_alt?: string | null
          sheet_id?: string | null
        }
        Update: {
          code?: string
          district_code?: string
          name?: string
          name_alt?: string | null
          sheet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geo_communes_district_code_fkey"
            columns: ["district_code"]
            isOneToOne: false
            referencedRelation: "geo_districts"
            referencedColumns: ["code"]
          },
        ]
      }
      geo_districts: {
        Row: {
          code: string
          name: string
          name_alt: string | null
          province_code: string
          sheet_id: string | null
        }
        Insert: {
          code: string
          name: string
          name_alt?: string | null
          province_code: string
          sheet_id?: string | null
        }
        Update: {
          code?: string
          name?: string
          name_alt?: string | null
          province_code?: string
          sheet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geo_districts_province_code_fkey"
            columns: ["province_code"]
            isOneToOne: false
            referencedRelation: "geo_provinces"
            referencedColumns: ["code"]
          },
        ]
      }
      geo_provinces: {
        Row: {
          code: string
          name: string
          name_alt: string | null
          sheet_id: string | null
          sort_order: number
        }
        Insert: {
          code: string
          name: string
          name_alt?: string | null
          sheet_id?: string | null
          sort_order?: number
        }
        Update: {
          code?: string
          name?: string
          name_alt?: string | null
          sheet_id?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      item_categories: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          name_alt: string | null
          parent_id: string | null
          photo_path: string | null
          sheet_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          name_alt?: string | null
          parent_id?: string | null
          photo_path?: string | null
          sheet_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          name_alt?: string | null
          parent_id?: string | null
          photo_path?: string | null
          sheet_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "item_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      item_pictures: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_primary: boolean
          item_id: string
          photo_path: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_primary?: boolean
          item_id: string
          photo_path: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_primary?: boolean
          item_id?: string
          photo_path?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "item_pictures_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_pictures_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_variants: {
        Row: {
          active: boolean
          barcode: string | null
          created_at: string
          id: string
          item_id: string
          photo_path: string | null
          property_name: string | null
          property_value: string | null
          sheet_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          created_at?: string
          id?: string
          item_id: string
          photo_path?: string | null
          property_name?: string | null
          property_value?: string | null
          sheet_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          barcode?: string | null
          created_at?: string
          id?: string
          item_id?: string
          photo_path?: string | null
          property_name?: string | null
          property_value?: string | null
          sheet_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_variants_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_variants_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          active: boolean
          brand_id: string | null
          category_id: string | null
          code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          low_stock_qty: number
          name: string
          name_alt: string | null
          price_khr: number | null
          price_usd: number | null
          qty_per_box: number | null
          qty_per_carton: number | null
          sheet_id: string | null
          stock_qty: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          brand_id?: string | null
          category_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          low_stock_qty?: number
          name: string
          name_alt?: string | null
          price_khr?: number | null
          price_usd?: number | null
          qty_per_box?: number | null
          qty_per_carton?: number | null
          sheet_id?: string | null
          stock_qty?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          brand_id?: string | null
          category_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          low_stock_qty?: number
          name?: string
          name_alt?: string | null
          price_khr?: number | null
          price_usd?: number | null
          qty_per_box?: number | null
          qty_per_carton?: number | null
          sheet_id?: string | null
          stock_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "item_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balances: {
        Row: {
          leave_type: Database["public"]["Enums"]["leave_type"]
          quota_days: number
          updated_at: string
          updated_by: string | null
          user_id: string
          year: number
        }
        Insert: {
          leave_type: Database["public"]["Enums"]["leave_type"]
          quota_days?: number
          updated_at?: string
          updated_by?: string | null
          user_id: string
          year: number
        }
        Update: {
          leave_type?: Database["public"]["Enums"]["leave_type"]
          quota_days?: number
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          end_date: string
          end_half_day: boolean
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason: string | null
          start_date: string
          start_half_day: boolean
          status: Database["public"]["Enums"]["leave_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          end_date: string
          end_half_day?: boolean
          id?: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason?: string | null
          start_date: string
          start_half_day?: boolean
          status?: Database["public"]["Enums"]["leave_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          end_date?: string
          end_half_day?: boolean
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          reason?: string | null
          start_date?: string
          start_half_day?: boolean
          status?: Database["public"]["Enums"]["leave_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      location_pings: {
        Row: {
          accuracy_m: number | null
          created_at: string
          distance_m: number | null
          id: number
          latitude: number
          longitude: number
          out_of_range: boolean
          user_id: string
          visit_id: string
        }
        Insert: {
          accuracy_m?: number | null
          created_at?: string
          distance_m?: number | null
          id?: number
          latitude: number
          longitude: number
          out_of_range?: boolean
          user_id?: string
          visit_id: string
        }
        Update: {
          accuracy_m?: number | null
          created_at?: string
          distance_m?: number | null
          id?: number
          latitude?: number
          longitude?: number
          out_of_range?: boolean
          user_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_pings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_pings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_pings_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          active: boolean
          group_name: string
          href: string
          icon: string
          key: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          group_name?: string
          href: string
          icon?: string
          key: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          group_name?: string
          href?: string
          icon?: string
          key?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          attendance_id: string | null
          comment: string
          created_at: string
          details: Json
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          occurred_at: string
          pushed_at: string | null
          read_at: string | null
          user_id: string
          visit_id: string | null
        }
        Insert: {
          attendance_id?: string | null
          comment: string
          created_at?: string
          details?: Json
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          occurred_at: string
          pushed_at?: string | null
          read_at?: string | null
          user_id: string
          visit_id?: string | null
        }
        Update: {
          attendance_id?: string | null
          comment?: string
          created_at?: string
          details?: Json
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          occurred_at?: string
          pushed_at?: string | null
          read_at?: string | null
          user_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          created_at: string
          name: string
          sheet_id: string | null
          use_count: number
        }
        Insert: {
          created_at?: string
          name: string
          sheet_id?: string | null
          use_count?: number
        }
        Update: {
          created_at?: string
          name?: string
          sheet_id?: string | null
          use_count?: number
        }
        Relationships: []
      }
      printers: {
        Row: {
          active: boolean
          created_at: string
          eprint_address: string
          id: string
          is_default: boolean
          label: string
          location: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          eprint_address: string
          id?: string
          is_default?: boolean
          label: string
          location?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          eprint_address?: string
          id?: string
          is_default?: boolean
          label?: string
          location?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          action: Database["public"]["Enums"]["permission_action"]
          module_key: string
          role_id: string
          scope: Database["public"]["Enums"]["permission_scope"]
        }
        Insert: {
          action: Database["public"]["Enums"]["permission_action"]
          module_key: string
          role_id: string
          scope: Database["public"]["Enums"]["permission_scope"]
        }
        Update: {
          action?: Database["public"]["Enums"]["permission_action"]
          module_key?: string
          role_id?: string
          scope?: Database["public"]["Enums"]["permission_scope"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_views: {
        Row: {
          role_id: string
          sort_order: number
          view_key: string
        }
        Insert: {
          role_id: string
          sort_order?: number
          view_key: string
        }
        Update: {
          role_id?: string
          sort_order?: number
          view_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_views_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_views_view_key_fkey"
            columns: ["view_key"]
            isOneToOne: false
            referencedRelation: "views"
            referencedColumns: ["key"]
          },
        ]
      }
      roles: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          key: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          key: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      sale_order_lines: {
        Row: {
          discount_amount: number
          discount_mode: Database["public"]["Enums"]["discount_mode"]
          discount_percent: number
          free_quantity: number
          id: string
          item_code: string | null
          item_id: string | null
          item_name: string
          line_total_khr: number | null
          line_total_usd: number | null
          order_id: string
          quantity: number
          sort_order: number
          unit_price_khr: number | null
          unit_price_usd: number | null
        }
        Insert: {
          discount_amount?: number
          discount_mode?: Database["public"]["Enums"]["discount_mode"]
          discount_percent?: number
          free_quantity?: number
          id?: string
          item_code?: string | null
          item_id?: string | null
          item_name: string
          line_total_khr?: number | null
          line_total_usd?: number | null
          order_id: string
          quantity: number
          sort_order?: number
          unit_price_khr?: number | null
          unit_price_usd?: number | null
        }
        Update: {
          discount_amount?: number
          discount_mode?: Database["public"]["Enums"]["discount_mode"]
          discount_percent?: number
          free_quantity?: number
          id?: string
          item_code?: string | null
          item_id?: string | null
          item_name?: string
          line_total_khr?: number | null
          line_total_usd?: number | null
          order_id?: string
          quantity?: number
          sort_order?: number
          unit_price_khr?: number | null
          unit_price_usd?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_order_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_order_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sale_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_orders: {
        Row: {
          created_at: string
          customer_id: string
          discount_khr: number | null
          discount_usd: number | null
          id: string
          note: string | null
          order_no: string
          status: Database["public"]["Enums"]["sale_order_status"]
          total_khr: number | null
          total_usd: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          discount_khr?: number | null
          discount_usd?: number | null
          id?: string
          note?: string | null
          order_no: string
          status?: Database["public"]["Enums"]["sale_order_status"]
          total_khr?: number | null
          total_usd?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          discount_khr?: number | null
          discount_usd?: number | null
          id?: string
          note?: string | null
          order_no?: string
          status?: Database["public"]["Enums"]["sale_order_status"]
          total_khr?: number | null
          total_usd?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_column_maps: {
        Row: {
          id: string
          reference_table: string | null
          sheet_column: string
          sort_order: number
          sync_id: string
          target_column: string | null
          transform: Database["public"]["Enums"]["sync_transform"]
          transform_arg: string | null
          value_kind: Database["public"]["Enums"]["sync_value"]
        }
        Insert: {
          id?: string
          reference_table?: string | null
          sheet_column: string
          sort_order?: number
          sync_id: string
          target_column?: string | null
          transform?: Database["public"]["Enums"]["sync_transform"]
          transform_arg?: string | null
          value_kind?: Database["public"]["Enums"]["sync_value"]
        }
        Update: {
          id?: string
          reference_table?: string | null
          sheet_column?: string
          sort_order?: number
          sync_id?: string
          target_column?: string | null
          transform?: Database["public"]["Enums"]["sync_transform"]
          transform_arg?: string | null
          value_kind?: Database["public"]["Enums"]["sync_value"]
        }
        Relationships: [
          {
            foreignKeyName: "sync_column_maps_reference_table_fkey"
            columns: ["reference_table"]
            isOneToOne: false
            referencedRelation: "sync_targets"
            referencedColumns: ["table_name"]
          },
          {
            foreignKeyName: "sync_column_maps_sync_id_fkey"
            columns: ["sync_id"]
            isOneToOne: false
            referencedRelation: "sync_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_definitions: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          header_row: number
          hook_token: string
          id: string
          interval_minutes: number | null
          last_run_at: string | null
          match_on: Database["public"]["Enums"]["sync_match"]
          name: string
          next_run_at: string | null
          require_column: string | null
          spreadsheet_id: string
          tab_name: string
          target_table: string
          trigger_kind: Database["public"]["Enums"]["sync_trigger"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          header_row?: number
          hook_token?: string
          id?: string
          interval_minutes?: number | null
          last_run_at?: string | null
          match_on?: Database["public"]["Enums"]["sync_match"]
          name: string
          next_run_at?: string | null
          require_column?: string | null
          spreadsheet_id: string
          tab_name: string
          target_table: string
          trigger_kind?: Database["public"]["Enums"]["sync_trigger"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          header_row?: number
          hook_token?: string
          id?: string
          interval_minutes?: number | null
          last_run_at?: string | null
          match_on?: Database["public"]["Enums"]["sync_match"]
          name?: string
          next_run_at?: string | null
          require_column?: string | null
          spreadsheet_id?: string
          tab_name?: string
          target_table?: string
          trigger_kind?: Database["public"]["Enums"]["sync_trigger"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_definitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_definitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_definitions_target_table_fkey"
            columns: ["target_table"]
            isOneToOne: false
            referencedRelation: "sync_targets"
            referencedColumns: ["table_name"]
          },
        ]
      }
      sync_runs: {
        Row: {
          actor_id: string | null
          finished_at: string | null
          id: string
          message: string | null
          rows_read: number
          rows_skipped: number
          rows_written: number
          source: Database["public"]["Enums"]["sync_source"]
          started_at: string
          status: Database["public"]["Enums"]["sync_status"]
          sync_id: string
        }
        Insert: {
          actor_id?: string | null
          finished_at?: string | null
          id?: string
          message?: string | null
          rows_read?: number
          rows_skipped?: number
          rows_written?: number
          source: Database["public"]["Enums"]["sync_source"]
          started_at?: string
          status?: Database["public"]["Enums"]["sync_status"]
          sync_id: string
        }
        Update: {
          actor_id?: string | null
          finished_at?: string | null
          id?: string
          message?: string | null
          rows_read?: number
          rows_skipped?: number
          rows_written?: number
          source?: Database["public"]["Enums"]["sync_source"]
          started_at?: string
          status?: Database["public"]["Enums"]["sync_status"]
          sync_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_runs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_runs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_runs_sync_id_fkey"
            columns: ["sync_id"]
            isOneToOne: false
            referencedRelation: "sync_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_targets: {
        Row: {
          blocked_columns: string[]
          conflict_target: string
          key_column: string
          label: string
          pk_column: string
          sort_order: number
          table_name: string
        }
        Insert: {
          blocked_columns?: string[]
          conflict_target: string
          key_column: string
          label: string
          pk_column?: string
          sort_order?: number
          table_name: string
        }
        Update: {
          blocked_columns?: string[]
          conflict_target?: string
          key_column?: string
          label?: string
          pk_column?: string
          sort_order?: number
          table_name?: string
        }
        Relationships: []
      }
      translation_overrides: {
        Row: {
          key: string
          language: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          key: string
          language: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          key?: string
          language?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "translation_overrides_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "translation_overrides_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permission_overrides: {
        Row: {
          action: Database["public"]["Enums"]["permission_action"]
          module_key: string
          note: string | null
          scope: Database["public"]["Enums"]["permission_scope"]
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["permission_action"]
          module_key: string
          note?: string | null
          scope: Database["public"]["Enums"]["permission_scope"]
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["permission_action"]
          module_key?: string
          note?: string | null
          scope?: Database["public"]["Enums"]["permission_scope"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_pins: {
        Row: {
          failed_attempts: number
          locked_until: string | null
          pin_hash: string
          set_at: string
          user_id: string
        }
        Insert: {
          failed_attempts?: number
          locked_until?: string | null
          pin_hash: string
          set_at?: string
          user_id: string
        }
        Update: {
          failed_attempts?: number
          locked_until?: string | null
          pin_hash?: string
          set_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_pins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_pins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_views: {
        Row: {
          effect: Database["public"]["Enums"]["permission_effect"]
          note: string | null
          user_id: string
          view_key: string
        }
        Insert: {
          effect: Database["public"]["Enums"]["permission_effect"]
          note?: string | null
          user_id: string
          view_key: string
        }
        Update: {
          effect?: Database["public"]["Enums"]["permission_effect"]
          note?: string | null
          user_id?: string
          view_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_views_view_key_fkey"
            columns: ["view_key"]
            isOneToOne: false
            referencedRelation: "views"
            referencedColumns: ["key"]
          },
        ]
      }
      user_visit_quotas: {
        Row: {
          daily_active_hours: number | null
          daily_visit_target: number | null
          daily_working_hours: number | null
          updated_at: string
          updated_by: string | null
          user_id: string
          weekly_active_hours: number | null
          weekly_visit_target: number | null
          weekly_working_hours: number | null
        }
        Insert: {
          daily_active_hours?: number | null
          daily_visit_target?: number | null
          daily_working_hours?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
          weekly_active_hours?: number | null
          weekly_visit_target?: number | null
          weekly_working_hours?: number | null
        }
        Update: {
          daily_active_hours?: number | null
          daily_visit_target?: number | null
          daily_working_hours?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          weekly_active_hours?: number | null
          weekly_visit_target?: number | null
          weekly_working_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_visit_quotas_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_visit_quotas_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_visit_quotas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_visit_quotas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          bank_account_name: string | null
          bank_account_number: string | null
          bank_name: string | null
          created_at: string
          date_of_birth: string | null
          department_id: string | null
          discharged_date: string | null
          email: string | null
          employment_date: string | null
          full_name: string
          gender: Database["public"]["Enums"]["gender"] | null
          id: string
          is_field_sales: boolean
          is_super_admin: boolean
          manager_id: string | null
          nickname: string | null
          phone_primary: string | null
          phone_secondary: string | null
          photo_path: string | null
          position: string | null
          role_id: string | null
          status: Database["public"]["Enums"]["user_status"]
          status_changed_at: string | null
          status_changed_by: string | null
          status_note: string | null
          suspended_from: string | null
          suspended_to: string | null
          telegram_id: string | null
          updated_at: string
        }
        Insert: {
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          created_at?: string
          date_of_birth?: string | null
          department_id?: string | null
          discharged_date?: string | null
          email?: string | null
          employment_date?: string | null
          full_name: string
          gender?: Database["public"]["Enums"]["gender"] | null
          id?: string
          is_field_sales?: boolean
          is_super_admin?: boolean
          manager_id?: string | null
          nickname?: string | null
          phone_primary?: string | null
          phone_secondary?: string | null
          photo_path?: string | null
          position?: string | null
          role_id?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_note?: string | null
          suspended_from?: string | null
          suspended_to?: string | null
          telegram_id?: string | null
          updated_at?: string
        }
        Update: {
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          created_at?: string
          date_of_birth?: string | null
          department_id?: string | null
          discharged_date?: string | null
          email?: string | null
          employment_date?: string | null
          full_name?: string
          gender?: Database["public"]["Enums"]["gender"] | null
          id?: string
          is_field_sales?: boolean
          is_super_admin?: boolean
          manager_id?: string | null
          nickname?: string | null
          phone_primary?: string | null
          phone_secondary?: string | null
          photo_path?: string | null
          position?: string | null
          role_id?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_note?: string | null
          suspended_from?: string | null
          suspended_to?: string | null
          telegram_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_status_changed_by_fkey"
            columns: ["status_changed_by"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_status_changed_by_fkey"
            columns: ["status_changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      view_modules: {
        Row: {
          module_key: string
          sort_order: number
          view_key: string
        }
        Insert: {
          module_key: string
          sort_order?: number
          view_key: string
        }
        Update: {
          module_key?: string
          sort_order?: number
          view_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "view_modules_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "view_modules_view_key_fkey"
            columns: ["view_key"]
            isOneToOne: false
            referencedRelation: "views"
            referencedColumns: ["key"]
          },
        ]
      }
      views: {
        Row: {
          active: boolean
          description: string | null
          icon: string
          key: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          description?: string | null
          icon?: string
          key: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          description?: string | null
          icon?: string
          key?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      visit_options: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["visit_option_kind"]
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["visit_option_kind"]
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["visit_option_kind"]
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      visits: {
        Row: {
          attendance_id: string | null
          auto_closed: boolean
          cancel_reason: string | null
          cancelled_at: string | null
          checked_in_at: string
          checked_out_at: string | null
          checkout_distance_m: number | null
          checkout_out_of_range: boolean
          created_at: string
          customer_id: string | null
          distance_m: number | null
          flags: string[]
          id: string
          in_accuracy_m: number | null
          in_latitude: number | null
          in_longitude: number | null
          next_appointment: string | null
          order_status_id: string | null
          out_accuracy_m: number | null
          out_latitude: number | null
          out_longitude: number | null
          out_of_range: boolean
          payment_status_id: string | null
          radius_m: number | null
          remarks: string | null
          updated_at: string
          user_id: string
          visit_number: number | null
          visit_status_id: string | null
          visit_type_id: string | null
        }
        Insert: {
          attendance_id?: string | null
          auto_closed?: boolean
          cancel_reason?: string | null
          cancelled_at?: string | null
          checked_in_at?: string
          checked_out_at?: string | null
          checkout_distance_m?: number | null
          checkout_out_of_range?: boolean
          created_at?: string
          customer_id?: string | null
          distance_m?: number | null
          flags?: string[]
          id?: string
          in_accuracy_m?: number | null
          in_latitude?: number | null
          in_longitude?: number | null
          next_appointment?: string | null
          order_status_id?: string | null
          out_accuracy_m?: number | null
          out_latitude?: number | null
          out_longitude?: number | null
          out_of_range?: boolean
          payment_status_id?: string | null
          radius_m?: number | null
          remarks?: string | null
          updated_at?: string
          user_id?: string
          visit_number?: number | null
          visit_status_id?: string | null
          visit_type_id?: string | null
        }
        Update: {
          attendance_id?: string | null
          auto_closed?: boolean
          cancel_reason?: string | null
          cancelled_at?: string | null
          checked_in_at?: string
          checked_out_at?: string | null
          checkout_distance_m?: number | null
          checkout_out_of_range?: boolean
          created_at?: string
          customer_id?: string | null
          distance_m?: number | null
          flags?: string[]
          id?: string
          in_accuracy_m?: number | null
          in_latitude?: number | null
          in_longitude?: number | null
          next_appointment?: string | null
          order_status_id?: string | null
          out_accuracy_m?: number | null
          out_latitude?: number | null
          out_longitude?: number | null
          out_of_range?: boolean
          payment_status_id?: string | null
          radius_m?: number | null
          remarks?: string | null
          updated_at?: string
          user_id?: string
          visit_number?: number | null
          visit_status_id?: string | null
          visit_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visits_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_order_status_id_fkey"
            columns: ["order_status_id"]
            isOneToOne: false
            referencedRelation: "visit_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_payment_status_id_fkey"
            columns: ["payment_status_id"]
            isOneToOne: false
            referencedRelation: "visit_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_visit_status_id_fkey"
            columns: ["visit_status_id"]
            isOneToOne: false
            referencedRelation: "visit_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_visit_type_id_fkey"
            columns: ["visit_type_id"]
            isOneToOne: false
            referencedRelation: "visit_options"
            referencedColumns: ["id"]
          },
        ]
      }
      work_locations: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          latitude: number
          longitude: number
          name: string
          radius_m: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          latitude: number
          longitude: number
          name: string
          radius_m?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          radius_m?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_locations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_locations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      customer_directory: {
        Row: {
          business_type: string | null
          commune_name: string | null
          contact_count: number | null
          credit_limit_usd: number | null
          district_name: string | null
          id: string | null
          landmark: string | null
          last_purchase_date: string | null
          last_visit_date: string | null
          latitude: number | null
          longitude: number | null
          owner_id: string | null
          owner_name: string | null
          primary_contact_name: string | null
          primary_contact_phone: string | null
          primary_photo_path: string | null
          province_code: string | null
          province_name: string | null
          shop_name: string | null
          status: Database["public"]["Enums"]["customer_status"] | null
          street_address: string | null
          zipcode: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_province_code_fkey"
            columns: ["province_code"]
            isOneToOne: false
            referencedRelation: "geo_provinces"
            referencedColumns: ["code"]
          },
        ]
      }
      item_catalogue: {
        Row: {
          active: boolean | null
          brand_id: string | null
          brand_name: string | null
          category_id: string | null
          category_name: string | null
          category_name_alt: string | null
          category_parent_id: string | null
          category_parent_name: string | null
          category_parent_name_alt: string | null
          code: string | null
          codes: string | null
          description: string | null
          id: string | null
          low_stock_qty: number | null
          name: string | null
          name_alt: string | null
          photo_path: string | null
          price_khr: number | null
          price_usd: number | null
          qty_per_box: number | null
          qty_per_carton: number | null
          sheet_id: string | null
          stock_qty: number | null
          variant_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "item_categories_parent_id_fkey"
            columns: ["category_parent_id"]
            isOneToOne: false
            referencedRelation: "item_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "item_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balance_summary: {
        Row: {
          leave_type: Database["public"]["Enums"]["leave_type"] | null
          quota_days: number | null
          remaining_days: number | null
          used_days: number | null
          user_id: string | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_feed: {
        Row: {
          attendance_id: string | null
          comment: string | null
          created_at: string | null
          customer_name: string | null
          details: Json | null
          id: string | null
          kind: Database["public"]["Enums"]["notification_kind"] | null
          occurred_at: string | null
          read_at: string | null
          user_id: string | null
          user_name: string | null
          visit_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      user_directory: {
        Row: {
          department_id: string | null
          discharged_date: string | null
          email: string | null
          employment_date: string | null
          full_name: string | null
          gender: Database["public"]["Enums"]["gender"] | null
          id: string | null
          manager_id: string | null
          nickname: string | null
          phone_primary: string | null
          phone_secondary: string | null
          photo_path: string | null
          position: string | null
          role_id: string | null
          status: Database["public"]["Enums"]["user_status"] | null
          suspended_from: string | null
          suspended_to: string | null
          telegram_id: string | null
        }
        Insert: {
          department_id?: string | null
          discharged_date?: string | null
          email?: string | null
          employment_date?: string | null
          full_name?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          id?: string | null
          manager_id?: string | null
          nickname?: string | null
          phone_primary?: string | null
          phone_secondary?: string | null
          photo_path?: string | null
          position?: string | null
          role_id?: string | null
          status?: Database["public"]["Enums"]["user_status"] | null
          suspended_from?: string | null
          suspended_to?: string | null
          telegram_id?: string | null
        }
        Update: {
          department_id?: string | null
          discharged_date?: string | null
          email?: string | null
          employment_date?: string | null
          full_name?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          id?: string | null
          manager_id?: string | null
          nickname?: string | null
          phone_primary?: string | null
          phone_secondary?: string | null
          photo_path?: string | null
          position?: string | null
          role_id?: string | null
          status?: Database["public"]["Enums"]["user_status"] | null
          suspended_from?: string | null
          suspended_to?: string | null
          telegram_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can: {
        Args: {
          p_action: Database["public"]["Enums"]["permission_action"]
          p_module: string
          p_owner?: string
        }
        Returns: boolean
      }
      can_delete_user: { Args: { p_user: string }; Returns: boolean }
      can_edit_user: { Args: { p_user: string }; Returns: boolean }
      can_edit_visit_quota: { Args: { p_user: string }; Returns: boolean }
      cancel_leave_request: {
        Args: { p_id: string }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          end_date: string
          end_half_day: boolean
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason: string | null
          start_date: string
          start_half_day: boolean
          status: Database["public"]["Enums"]["leave_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "leave_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_visit: {
        Args: { p_reason?: string; p_visit: string }
        Returns: {
          attendance_id: string | null
          auto_closed: boolean
          cancel_reason: string | null
          cancelled_at: string | null
          checked_in_at: string
          checked_out_at: string | null
          checkout_distance_m: number | null
          checkout_out_of_range: boolean
          created_at: string
          customer_id: string | null
          distance_m: number | null
          flags: string[]
          id: string
          in_accuracy_m: number | null
          in_latitude: number | null
          in_longitude: number | null
          next_appointment: string | null
          order_status_id: string | null
          out_accuracy_m: number | null
          out_latitude: number | null
          out_longitude: number | null
          out_of_range: boolean
          payment_status_id: string | null
          radius_m: number | null
          remarks: string | null
          updated_at: string
          user_id: string
          visit_number: number | null
          visit_status_id: string | null
          visit_type_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_in: {
        Args: {
          p_accuracy?: number
          p_customer: string
          p_latitude: number
          p_longitude: number
        }
        Returns: {
          attendance_id: string | null
          auto_closed: boolean
          cancel_reason: string | null
          cancelled_at: string | null
          checked_in_at: string
          checked_out_at: string | null
          checkout_distance_m: number | null
          checkout_out_of_range: boolean
          created_at: string
          customer_id: string | null
          distance_m: number | null
          flags: string[]
          id: string
          in_accuracy_m: number | null
          in_latitude: number | null
          in_longitude: number | null
          next_appointment: string | null
          order_status_id: string | null
          out_accuracy_m: number | null
          out_latitude: number | null
          out_longitude: number | null
          out_of_range: boolean
          payment_status_id: string | null
          radius_m: number | null
          remarks: string | null
          updated_at: string
          user_id: string
          visit_number: number | null
          visit_status_id: string | null
          visit_type_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_out: {
        Args: {
          p_accuracy?: number
          p_latitude: number
          p_longitude: number
          p_next_appointment?: string
          p_order_status_id?: string
          p_payment_status_id?: string
          p_remarks?: string
          p_visit: string
          p_visit_status_id?: string
          p_visit_type_id?: string
        }
        Returns: {
          attendance_id: string | null
          auto_closed: boolean
          cancel_reason: string | null
          cancelled_at: string | null
          checked_in_at: string
          checked_out_at: string | null
          checkout_distance_m: number | null
          checkout_out_of_range: boolean
          created_at: string
          customer_id: string | null
          distance_m: number | null
          flags: string[]
          id: string
          in_accuracy_m: number | null
          in_latitude: number | null
          in_longitude: number | null
          next_appointment: string | null
          order_status_id: string | null
          out_accuracy_m: number | null
          out_latitude: number | null
          out_longitude: number | null
          out_of_range: boolean
          payment_status_id: string | null
          radius_m: number | null
          remarks: string | null
          updated_at: string
          user_id: string
          visit_number: number | null
          visit_status_id: string | null
          visit_type_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      clock_in: {
        Args: {
          p_accuracy: number
          p_latitude: number
          p_longitude: number
          p_selfie_path: string
        }
        Returns: {
          auto_clocked_out: boolean
          clock_in_accuracy_m: number | null
          clock_in_at: string
          clock_in_latitude: number
          clock_in_location_id: string | null
          clock_in_longitude: number
          clock_in_selfie_path: string
          clock_out_accuracy_m: number | null
          clock_out_at: string | null
          clock_out_latitude: number | null
          clock_out_location_id: string | null
          clock_out_longitude: number | null
          clock_out_selfie_path: string | null
          created_at: string
          flags: string[]
          id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "attendance"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      clock_out: {
        Args: {
          p_accuracy: number
          p_latitude: number
          p_longitude: number
          p_selfie_path: string
        }
        Returns: Json
      }
      close_stale_visits: { Args: never; Returns: number }
      confirm_cart: {
        Args: never
        Returns: {
          created_at: string
          customer_id: string
          discount_khr: number | null
          discount_usd: number | null
          id: string
          note: string | null
          order_no: string
          status: Database["public"]["Enums"]["sale_order_status"]
          total_khr: number | null
          total_usd: number | null
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sale_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decide_leave_request: {
        Args: { p_approve: boolean; p_id: string; p_note?: string }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          end_date: string
          end_half_day: boolean
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason: string | null
          start_date: string
          start_half_day: boolean
          status: Database["public"]["Enums"]["leave_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "leave_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      enforce_working_hours: {
        Args: { p_accuracy?: number; p_latitude: number; p_longitude: number }
        Returns: Json
      }
      ensure_my_cart: { Args: never; Returns: string }
      manageable_users: {
        Args: never
        Returns: {
          created_at: string
          department_id: string
          department_name: string
          email: string
          employment_date: string
          full_name: string
          id: string
          is_field_sales: boolean
          is_super_admin: boolean
          manager_id: string
          manager_name: string
          nickname: string
          phone_primary: string
          photo_path: string
          position: string
          role_id: string
          role_name: string
          status: Database["public"]["Enums"]["user_status"]
          telegram_id: string
        }[]
      }
      mark_notifications_pushed: {
        Args: { p_ids: string[] }
        Returns: undefined
      }
      my_modules: {
        Args: { p_view: string }
        Returns: {
          group_name: string
          href: string
          icon: string
          module_key: string
          name: string
          sort_order: number
          view_key: string
          view_name: string
        }[]
      }
      my_nav: {
        Args: { p_view: string }
        Returns: {
          group_name: string
          href: string
          icon: string
          module_key: string
          name: string
          sort_order: number
        }[]
      }
      my_permissions: {
        Args: never
        Returns: {
          action: Database["public"]["Enums"]["permission_action"]
          module_key: string
          scope: Database["public"]["Enums"]["permission_scope"]
        }[]
      }
      my_pin_is_set: { Args: never; Returns: boolean }
      my_team: {
        Args: never
        Returns: {
          department_id: string
          department_name: string
          full_name: string
          id: string
          is_field_sales: boolean
          manager_id: string
          nickname: string
          photo_path: string
          position: string
          role_name: string
        }[]
      }
      my_views: {
        Args: never
        Returns: {
          description: string
          icon: string
          key: string
          name: string
          sort_order: number
        }[]
      }
      nearby_customers: {
        Args: { p_latitude: number; p_limit?: number; p_longitude: number }
        Returns: {
          business_type: string
          distance_m: number
          id: string
          shop_name: string
          street_address: string
        }[]
      }
      pending_push_notifications: {
        Args: never
        Returns: {
          auth: string
          endpoint: string
          kind: Database["public"]["Enums"]["notification_kind"]
          message: string
          notification_id: string
          p256dh: string
        }[]
      }
      record_location_ping: {
        Args: {
          p_accuracy?: number
          p_latitude: number
          p_longitude: number
          p_visit: string
        }
        Returns: Json
      }
      request_leave: {
        Args: {
          p_end_date: string
          p_end_half_day?: boolean
          p_leave_type: Database["public"]["Enums"]["leave_type"]
          p_reason?: string
          p_start_date: string
          p_start_half_day?: boolean
        }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          end_date: string
          end_half_day: boolean
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason: string | null
          start_date: string
          start_half_day: boolean
          status: Database["public"]["Enums"]["leave_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "leave_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      run_attendance_alerts: {
        Args: never
        Returns: {
          flagged_user_id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          message: string
          telegram_id: string
        }[]
      }
      set_default_printer: { Args: { p_printer: string }; Returns: undefined }
      set_leave_balance: {
        Args: {
          p_leave_type: Database["public"]["Enums"]["leave_type"]
          p_quota_days: number
          p_user_id: string
          p_year: number
        }
        Returns: {
          leave_type: Database["public"]["Enums"]["leave_type"]
          quota_days: number
          updated_at: string
          updated_by: string | null
          user_id: string
          year: number
        }
        SetofOptions: {
          from: "*"
          to: "leave_balances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_my_pin: { Args: { p_pin: string }; Returns: undefined }
      set_user_telegram_id: {
        Args: { p_telegram_id: string; p_user_id: string }
        Returns: undefined
      }
      sync_apply: { Args: { p_rows: Json; p_sync: string }; Returns: number }
      sync_clear: {
        Args: {
          p_commit?: boolean
          p_scope?: Database["public"]["Enums"]["sync_clear_scope"]
          p_table: string
        }
        Returns: number
      }
      sync_columns: {
        Args: { p_table: string }
        Returns: {
          column_name: string
          data_type: string
          is_required: boolean
        }[]
      }
      sync_columns_for_engine: {
        Args: { p_table: string }
        Returns: {
          column_name: string
          data_type: string
          is_required: boolean
        }[]
      }
      unvoid_visit: {
        Args: { p_visit: string }
        Returns: {
          attendance_id: string | null
          auto_closed: boolean
          cancel_reason: string | null
          cancelled_at: string | null
          checked_in_at: string
          checked_out_at: string | null
          checkout_distance_m: number | null
          checkout_out_of_range: boolean
          created_at: string
          customer_id: string | null
          distance_m: number | null
          flags: string[]
          id: string
          in_accuracy_m: number | null
          in_latitude: number | null
          in_longitude: number | null
          next_appointment: string | null
          order_status_id: string | null
          out_accuracy_m: number | null
          out_latitude: number | null
          out_longitude: number | null
          out_of_range: boolean
          payment_status_id: string | null
          radius_m: number | null
          remarks: string | null
          updated_at: string
          user_id: string
          visit_number: number | null
          visit_status_id: string | null
          visit_type_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_visit_record: {
        Args: {
          p_next_appointment?: string
          p_order_status_id?: string
          p_payment_status_id?: string
          p_remarks?: string
          p_visit: string
          p_visit_status_id?: string
          p_visit_type_id?: string
        }
        Returns: {
          attendance_id: string | null
          auto_closed: boolean
          cancel_reason: string | null
          cancelled_at: string | null
          checked_in_at: string
          checked_out_at: string | null
          checkout_distance_m: number | null
          checkout_out_of_range: boolean
          created_at: string
          customer_id: string | null
          distance_m: number | null
          flags: string[]
          id: string
          in_accuracy_m: number | null
          in_latitude: number | null
          in_longitude: number | null
          next_appointment: string | null
          order_status_id: string | null
          out_accuracy_m: number | null
          out_latitude: number | null
          out_longitude: number | null
          out_of_range: boolean
          payment_status_id: string | null
          radius_m: number | null
          remarks: string | null
          updated_at: string
          user_id: string
          visit_number: number | null
          visit_status_id: string | null
          visit_type_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      verify_my_pin: { Args: { p_pin: string }; Returns: boolean }
      void_visit: {
        Args: { p_reason?: string; p_visit: string }
        Returns: {
          attendance_id: string | null
          auto_closed: boolean
          cancel_reason: string | null
          cancelled_at: string | null
          checked_in_at: string
          checked_out_at: string | null
          checkout_distance_m: number | null
          checkout_out_of_range: boolean
          created_at: string
          customer_id: string | null
          distance_m: number | null
          flags: string[]
          id: string
          in_accuracy_m: number | null
          in_latitude: number | null
          in_longitude: number | null
          next_appointment: string | null
          order_status_id: string | null
          out_accuracy_m: number | null
          out_latitude: number | null
          out_longitude: number | null
          out_of_range: boolean
          payment_status_id: string | null
          radius_m: number | null
          remarks: string | null
          updated_at: string
          user_id: string
          visit_number: number | null
          visit_status_id: string | null
          visit_type_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      audit_action: "insert" | "update" | "delete"
      currency: "usd" | "khr"
      customer_status: "active" | "inactive" | "banned"
      discount_mode: "percent" | "amount"
      gender: "male" | "female" | "other"
      leave_status: "pending" | "approved" | "rejected" | "cancelled"
      leave_type: "annual" | "sick" | "unpaid"
      notification_kind:
        | "late_clock_in"
        | "idling_too_long"
        | "ineffective_visit"
        | "late_clock_out"
      permission_action: "view" | "add" | "edit" | "delete"
      permission_effect: "allow" | "deny"
      permission_scope: "own" | "sub" | "any" | "deny"
      sale_order_status: "new" | "cancelled"
      sync_clear_scope: "imported" | "all"
      sync_match: "sheet_id" | "natural"
      sync_source: "manual" | "schedule" | "change"
      sync_status: "running" | "ok" | "failed"
      sync_transform:
        | "none"
        | "latitude"
        | "longitude"
        | "suffix"
        | "fallback"
        | "drive_image"
        | "reference_name_prefix"
      sync_trigger: "change" | "interval"
      sync_value:
        | "text"
        | "number"
        | "integer"
        | "boolean"
        | "date"
        | "timestamp"
      user_status: "active" | "suspended" | "discharged"
      visit_option_kind:
        | "visit_type"
        | "visit_status"
        | "order_status"
        | "payment_status"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      audit_action: ["insert", "update", "delete"],
      currency: ["usd", "khr"],
      customer_status: ["active", "inactive", "banned"],
      discount_mode: ["percent", "amount"],
      gender: ["male", "female", "other"],
      leave_status: ["pending", "approved", "rejected", "cancelled"],
      leave_type: ["annual", "sick", "unpaid"],
      notification_kind: [
        "late_clock_in",
        "idling_too_long",
        "ineffective_visit",
        "late_clock_out",
      ],
      permission_action: ["view", "add", "edit", "delete"],
      permission_effect: ["allow", "deny"],
      permission_scope: ["own", "sub", "any", "deny"],
      sale_order_status: ["new", "cancelled"],
      sync_clear_scope: ["imported", "all"],
      sync_match: ["sheet_id", "natural"],
      sync_source: ["manual", "schedule", "change"],
      sync_status: ["running", "ok", "failed"],
      sync_transform: [
        "none",
        "latitude",
        "longitude",
        "suffix",
        "fallback",
        "drive_image",
        "reference_name_prefix",
      ],
      sync_trigger: ["change", "interval"],
      sync_value: ["text", "number", "integer", "boolean", "date", "timestamp"],
      user_status: ["active", "suspended", "discharged"],
      visit_option_kind: [
        "visit_type",
        "visit_status",
        "order_status",
        "payment_status",
      ],
    },
  },
} as const
