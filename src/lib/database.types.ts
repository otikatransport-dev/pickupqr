/**
 * Hand-written to match supabase/migrations/0001_init.sql so the app
 * type-checks before you have a live project. Once your Supabase project
 * exists, regenerate the real thing with:
 *
 *   npx supabase gen types typescript --project-id YOUR_PROJECT_REF > src/lib/database.types.ts
 *
 * and re-run `npm run build` to catch any drift.
 */

export type AppRole = "super_admin" | "company_admin" | "driver" | "employee";
export type WhatsAppStatus = "queued" | "sent" | "delivered" | "read" | "failed";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          phone: string | null;
          role: AppRole;
          company_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          phone?: string | null;
          role?: AppRole;
          company_id?: string | null;
        };
        Update: {
          full_name?: string | null;
          phone?: string | null;
          role?: AppRole;
          company_id?: string | null;
        };
        Relationships: [];
      };
      companies: {
        Row: {
          id: string;
          name: string;
          color: string | null;
          logo_url: string | null;
          address: string | null;
          created_at: string;
        };
        Insert: {
          name: string;
          color?: string | null;
          logo_url?: string | null;
          address?: string | null;
        };
        Update: {
          name?: string;
          color?: string | null;
          logo_url?: string | null;
          address?: string | null;
        };
        Relationships: [];
      };
      drivers: {
        Row: {
          id: string;
          profile_id: string;
          company_id: string | null;
          vehicle_number: string | null;
          phone: string | null;
          whatsapp_opt_in: boolean;
          whatsapp_opt_in_at: string | null;
          created_at: string;
        };
        Insert: {
          profile_id: string;
          company_id?: string | null;
          vehicle_number?: string | null;
          phone?: string | null;
          whatsapp_opt_in?: boolean;
          whatsapp_opt_in_at?: string | null;
        };
        Update: {
          company_id?: string | null;
          vehicle_number?: string | null;
          phone?: string | null;
          whatsapp_opt_in?: boolean;
          whatsapp_opt_in_at?: string | null;
        };
        Relationships: [];
      };
      boarding_points: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          address: string | null;
          lat: number | null;
          lng: number | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          company_id: string;
          name: string;
          address?: string | null;
          lat?: number | null;
          lng?: number | null;
          created_by?: string | null;
        };
        Update: {
          name?: string;
          address?: string | null;
          lat?: number | null;
          lng?: number | null;
        };
        Relationships: [];
      };
      routes: {
        Row: {
          id: string;
          driver_id: string;
          company_id: string;
          boarding_point_id: string;
          route_geometry: unknown | null;
          map_preview_url: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          driver_id: string;
          company_id: string;
          boarding_point_id: string;
          route_geometry?: unknown | null;
          map_preview_url?: string | null;
          status?: string;
        };
        Update: {
          driver_id?: string;
          boarding_point_id?: string;
          route_geometry?: unknown | null;
          map_preview_url?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      employees: {
        Row: {
          id: string;
          profile_id: string | null;
          name: string;
          phone_normalized: string;
          company_id: string | null;
          qr_token: string;
          qr_image_url: string | null;
          last_scanned_at: string | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          profile_id?: string | null;
          name: string;
          phone_normalized: string;
          company_id?: string | null;
          qr_image_url?: string | null;
          active?: boolean;
        };
        Update: {
          name?: string;
          company_id?: string | null;
          qr_image_url?: string | null;
          last_scanned_at?: string | null;
          active?: boolean;
        };
        Relationships: [];
      };
      qr_scans: {
        Row: {
          id: string;
          employee_id: string;
          scanned_by_driver_id: string | null;
          company_id: string | null;
          scanned_at: string;
          assigned_company_id: string | null;
        };
        Insert: {
          employee_id: string;
          scanned_by_driver_id?: string | null;
          company_id?: string | null;
          assigned_company_id?: string | null;
        };
        Update: {
          assigned_company_id?: string | null;
        };
        Relationships: [];
      };
      whatsapp_accounts: {
        Row: {
          id: string;
          company_id: string;
          waba_id: string | null;
          phone_number_id: string | null;
          access_token: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          company_id: string;
          waba_id?: string | null;
          phone_number_id?: string | null;
          access_token?: string | null;
          status?: string;
        };
        Update: {
          waba_id?: string | null;
          phone_number_id?: string | null;
          access_token?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      whatsapp_messages: {
        Row: {
          id: string;
          employee_id: string;
          template_name: string | null;
          status: string | null;
          sent_at: string;
        };
        Insert: {
          employee_id: string;
          template_name?: string | null;
          status?: string | null;
        };
        Update: {
          status?: string | null;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
          id: number;
          app_name: string;
          brand_color: string;
          accent_color: string;
          logo_url: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: never;
        Update: {
          app_name?: string;
          brand_color?: string;
          accent_color?: string;
          logo_url?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      plannings: {
        Row: {
          id: string;
          driver_id: string;
          company_id: string | null;
          plan_date: string; // yyyy-mm-dd
          shift_label: string | null;
          notice: string | null;
          image_path: string;
          created_by: string | null;
          created_at: string;
          viewed_at: string | null;
          whatsapp_status: WhatsAppStatus | null;
          whatsapp_message_id: string | null;
          whatsapp_error: string | null;
          whatsapp_sent_at: string | null;
        };
        Insert: {
          driver_id: string;
          plan_date: string;
          image_path: string;
          shift_label?: string | null;
          notice?: string | null;
          created_by?: string | null;
        };
        Update: {
          shift_label?: string | null;
          notice?: string | null;
          whatsapp_status?: WhatsAppStatus | null;
          whatsapp_message_id?: string | null;
          whatsapp_error?: string | null;
          whatsapp_sent_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      set_my_whatsapp_opt_in: { Args: { opt_in: boolean }; Returns: undefined };
      mark_planning_viewed: { Args: { planning_id: string }; Returns: undefined };
    };
    Enums: {
      app_role: AppRole;
    };
    CompositeTypes: Record<string, never>;
  };
}
