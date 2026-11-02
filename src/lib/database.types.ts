/**
 * Hand-written to match supabase/migrations/0001_init.sql so the app
 * type-checks before you have a live project. Once your Supabase project
 * exists, regenerate the real thing with:
 *
 *   npx supabase gen types typescript --project-id YOUR_PROJECT_REF > src/lib/database.types.ts
 *
 * and re-run `npm run build` to catch any drift.
 */

export type AppRole = "super_admin" | "manager" | "admin_hr" | "recruiter" | "driver" | "employee" | "company_admin";
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
          avatar_url: string | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          phone?: string | null;
          role?: AppRole;
          company_id?: string | null;
          avatar_url?: string | null;
          active?: boolean;
        };
        Update: {
          full_name?: string | null;
          phone?: string | null;
          role?: AppRole;
          company_id?: string | null;
          avatar_url?: string | null;
          active?: boolean;
        };
        Relationships: [];
      };
      role_audit_log: {
        Row: {
          id: string; target_id: string; target_name: string | null; changed_by: string | null; changed_by_name: string | null;
          action: "create" | "role_change" | "deactivate" | "reactivate"; old_role: string | null; new_role: string | null; created_at: string;
        };
        Insert: {
          target_id: string; target_name?: string | null; changed_by?: string | null; changed_by_name?: string | null;
          action: "create" | "role_change" | "deactivate" | "reactivate"; old_role?: string | null; new_role?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      companies: {
        Row: {
          id: string;
          name: string;
          color: string | null;
          logo_url: string | null;
          address: string | null;
          metro_aller: string | null;
          metro_retour: string | null;
          contact: string | null;
          notes: string | null;
          code: string | null;
          phone: string | null;
          lat: number | null;
          lng: number | null;
          status: "active" | "archived";
          updated_at: string;
          created_at: string;
        };
        Insert: {
          name: string;
          code?: string | null;
          phone?: string | null;
          lat?: number | null;
          lng?: number | null;
          status?: "active" | "archived";
          color?: string | null;
          logo_url?: string | null;
          address?: string | null;
          metro_aller?: string | null;
          metro_retour?: string | null;
          contact?: string | null;
          notes?: string | null;
        };
        Update: {
          name?: string;
          code?: string | null;
          phone?: string | null;
          lat?: number | null;
          lng?: number | null;
          status?: "active" | "archived";
          color?: string | null;
          logo_url?: string | null;
          address?: string | null;
          metro_aller?: string | null;
          metro_retour?: string | null;
          contact?: string | null;
          notes?: string | null;
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
          qr_generated_at: string | null;
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
          qr_generated_at?: string | null;
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
      driver_routes: {
        Row: { id: string; driver_id: string; route_date: string; status: "draft" | "submitted" | "completed"; created_at: string; updated_at: string };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      driver_route_stops: {
        Row: {
          id: string; route_id: string; company_id: string; sequence: number; vehicle_number: string | null;
          status: "pending" | "in_progress" | "completed"; completed_at: string | null;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      set_my_whatsapp_opt_in: { Args: { opt_in: boolean }; Returns: undefined };
      mark_planning_viewed: { Args: { planning_id: string }; Returns: undefined };
      company_linked_records: {
        Args: Record<string, never>;
        Returns: { company_id: string; employees: number; drivers: number; boarding_points: number; routes: number; plannings: number; route_stops: number }[];
      };
      save_driver_route: { Args: { p_stops: unknown; p_post?: boolean }; Returns: string };
      posted_routes: {
        Args: { p_date?: string };
        Returns: {
          route_id: string; driver_id: string; driver_name: string; route_date: string; route_status: string;
          stop_sequence: number; company_id: string; company_name: string; company_color: string | null;
          vehicle_number: string | null; stop_status: string;
        }[];
      };
    };
    Enums: {
      app_role: AppRole;
    };
    CompositeTypes: Record<string, never>;
  };
}
