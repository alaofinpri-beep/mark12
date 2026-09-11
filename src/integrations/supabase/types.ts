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
      admin_grants: {
        Row: {
          created_at: string
          id: string
          is_general: boolean
          section_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_general?: boolean
          section_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_general?: boolean
          section_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_grants_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          app_name: string
          general_passkey: string
          id: number
          logo_url: string | null
          report_email: string
          updated_at: string
        }
        Insert: {
          app_name?: string
          general_passkey?: string
          id?: number
          logo_url?: string | null
          report_email?: string
          updated_at?: string
        }
        Update: {
          app_name?: string
          general_passkey?: string
          id?: number
          logo_url?: string | null
          report_email?: string
          updated_at?: string
        }
        Relationships: []
      }
      attendance_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          session_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          id?: string
          session_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_codes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          accuracy_m: number | null
          distance_m: number | null
          full_name: string
          id: string
          lat: number | null
          lng: number | null
          marked_at: string
          session_id: string
          student_id: string
        }
        Insert: {
          accuracy_m?: number | null
          distance_m?: number | null
          full_name: string
          id?: string
          lat?: number | null
          lng?: number | null
          marked_at?: string
          session_id: string
          student_id: string
        }
        Update: {
          accuracy_m?: number | null
          distance_m?: number | null
          full_name?: string
          id?: string
          lat?: number | null
          lng?: number | null
          marked_at?: string
          session_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          admin_id: string
          closed_at: string | null
          course_code: string | null
          course_name: string
          id: string
          is_active: boolean
          lat: number
          lng: number
          radius_m: number
          section_id: string | null
          started_at: string
        }
        Insert: {
          admin_id: string
          closed_at?: string | null
          course_code?: string | null
          course_name: string
          id?: string
          is_active?: boolean
          lat: number
          lng: number
          radius_m?: number
          section_id?: string | null
          started_at?: string
        }
        Update: {
          admin_id?: string
          closed_at?: string | null
          course_code?: string | null
          course_name?: string
          id?: string
          is_active?: boolean
          lat?: number
          lng?: number
          radius_m?: number
          section_id?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          matric_no: string | null
          section_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          matric_no?: string | null
          section_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          matric_no?: string | null
          section_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          created_at: string
          id: string
          is_disabled: boolean
          name: string
          passkey: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_disabled?: boolean
          name: string
          passkey: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_disabled?: boolean
          name?: string
          passkey?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_create_section: {
        Args: { _name: string; _passkey: string }
        Returns: Json
      }
      admin_delete_section: { Args: { _id: string }; Returns: Json }
      admin_delete_session: { Args: { _session: string }; Returns: Json }
      admin_general_passkey: { Args: never; Returns: string }
      admin_list_sections: {
        Args: never
        Returns: {
          created_at: string
          id: string
          is_disabled: boolean
          name: string
          passkey: string
        }[]
      }
      admin_set_general_passkey: { Args: { _passkey: string }; Returns: Json }
      admin_set_section_disabled: {
        Args: { _disabled: boolean; _id: string }
        Returns: Json
      }
      admin_update_section: {
        Args: { _id: string; _name: string; _passkey: string }
        Returns: Json
      }
      can_manage_section: {
        Args: { _section: string; _uid: string }
        Returns: boolean
      }
      can_manage_session: {
        Args: { _session: string; _uid: string }
        Returns: boolean
      }
      ensure_active_code: { Args: { _session: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_general_admin: { Args: { _uid: string }; Returns: boolean }
      list_departments: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      mark_attendance: {
        Args: {
          _accuracy?: number
          _code: string
          _full_name: string
          _lat: number
          _lng: number
          _session: string
        }
        Returns: Json
      }
      my_access: { Args: never; Returns: Json }
      unlock_passkey: {
        Args: { _passkey: string; _section?: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "student"
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
      app_role: ["admin", "student"],
    },
  },
} as const
