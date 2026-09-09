/**
 * Mirrors the Postgres schema in `supabase/migrations`. Regenerate after any
 * migration with:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
 */
export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      organizations: {
        Row: { id: string; name: string; join_code: string; created_at: string };
        Insert: { id?: string; name: string; join_code: string; created_at?: string };
        Update: { id?: string; name?: string; join_code?: string; created_at?: string };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          org_id: string | null;
          full_name: string;
          phone: string | null;
          role: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          org_id?: string | null;
          full_name?: string;
          phone?: string | null;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string | null;
          full_name?: string;
          phone?: string | null;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      jobs: {
        Row: {
          id: string;
          org_id: string;
          created_by: string;
          driver_id: string | null;
          address: string;
          address_lat: number | null;
          address_lng: number | null;
          customer_name: string | null;
          customer_phone: string | null;
          product_count: number;
          cash_to_collect: number;
          notes: string | null;
          status: string;
          decline_reason: string | null;
          eta_minutes: number | null;
          eta_at: string | null;
          eta_source: string | null;
          eta_updated_at: string | null;
          delivered_product_count: number | null;
          cash_collected: number | null;
          completion_notes: string | null;
          assigned_at: string;
          accepted_at: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          created_by: string;
          driver_id?: string | null;
          address: string;
          address_lat?: number | null;
          address_lng?: number | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          product_count?: number;
          cash_to_collect?: number;
          notes?: string | null;
          status?: string;
          decline_reason?: string | null;
          eta_minutes?: number | null;
          eta_at?: string | null;
          eta_source?: string | null;
          eta_updated_at?: string | null;
          delivered_product_count?: number | null;
          cash_collected?: number | null;
          completion_notes?: string | null;
          assigned_at?: string;
          accepted_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          created_by?: string;
          driver_id?: string | null;
          address?: string;
          address_lat?: number | null;
          address_lng?: number | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          product_count?: number;
          cash_to_collect?: number;
          notes?: string | null;
          status?: string;
          decline_reason?: string | null;
          eta_minutes?: number | null;
          eta_at?: string | null;
          eta_source?: string | null;
          eta_updated_at?: string | null;
          delivered_product_count?: number | null;
          cash_collected?: number | null;
          completion_notes?: string | null;
          assigned_at?: string;
          accepted_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'jobs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'jobs_driver_id_fkey';
            columns: ['driver_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'jobs_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      driver_locations: {
        Row: {
          driver_id: string;
          org_id: string;
          job_id: string | null;
          lat: number;
          lng: number;
          accuracy_m: number | null;
          speed_mps: number | null;
          heading_deg: number | null;
          battery_pct: number | null;
          recorded_at: string;
          updated_at: string;
        };
        Insert: {
          driver_id: string;
          org_id: string;
          job_id?: string | null;
          lat: number;
          lng: number;
          accuracy_m?: number | null;
          speed_mps?: number | null;
          heading_deg?: number | null;
          battery_pct?: number | null;
          recorded_at?: string;
          updated_at?: string;
        };
        Update: {
          driver_id?: string;
          org_id?: string;
          job_id?: string | null;
          lat?: number;
          lng?: number;
          accuracy_m?: number | null;
          speed_mps?: number | null;
          heading_deg?: number | null;
          battery_pct?: number | null;
          recorded_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'driver_locations_driver_id_fkey';
            columns: ['driver_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'driver_locations_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'driver_locations_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      device_tokens: {
        Row: {
          id: string;
          profile_id: string;
          expo_token: string;
          platform: string | null;
          device_name: string | null;
          created_at: string;
          last_seen_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          expo_token: string;
          platform?: string | null;
          device_name?: string | null;
          created_at?: string;
          last_seen_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          expo_token?: string;
          platform?: string | null;
          device_name?: string | null;
          created_at?: string;
          last_seen_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'device_tokens_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      location_pings: {
        Row: {
          id: number;
          driver_id: string;
          org_id: string;
          job_id: string | null;
          lat: number;
          lng: number;
          accuracy_m: number | null;
          speed_mps: number | null;
          heading_deg: number | null;
          recorded_at: string;
        };
        Insert: {
          id?: never;
          driver_id: string;
          org_id: string;
          job_id?: string | null;
          lat: number;
          lng: number;
          accuracy_m?: number | null;
          speed_mps?: number | null;
          heading_deg?: number | null;
          recorded_at?: string;
        };
        Update: {
          id?: never;
          driver_id?: string;
          org_id?: string;
          job_id?: string | null;
          lat?: number;
          lng?: number;
          accuracy_m?: number | null;
          speed_mps?: number | null;
          heading_deg?: number | null;
          recorded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'location_pings_driver_id_fkey';
            columns: ['driver_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'location_pings_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'location_pings_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_organization: {
        Args: { p_name: string };
        Returns: { id: string; name: string; join_code: string; created_at: string };
        SetofOptions: { from: '*'; to: 'organizations'; isOneToOne: true; isSetofReturn: false };
      };
      join_organization: {
        Args: { p_code: string };
        Returns: { id: string; name: string; join_code: string; created_at: string };
        SetofOptions: { from: '*'; to: 'organizations'; isOneToOne: true; isSetofReturn: false };
      };
      register_device_token: {
        Args: { p_token: string; p_platform?: string | null; p_device_name?: string | null };
        Returns: undefined;
      };
      unregister_device_token: { Args: { p_token: string }; Returns: undefined };
      leave_organization: { Args: never; Returns: undefined };
      remove_member: { Args: { p_member: string }; Returns: undefined };
      set_member_role: { Args: { p_member: string; p_role: string }; Returns: undefined };
      regenerate_join_code: { Args: never; Returns: string };
      current_org_id: { Args: never; Returns: string };
      current_user_role: { Args: never; Returns: string };
      is_boss: { Args: never; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];
