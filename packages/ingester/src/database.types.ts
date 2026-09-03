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
      assessments: {
        Row: {
          created_at: string
          id: number
          rule_set_id: string
          total: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          rule_set_id: string
          total: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          rule_set_id?: string
          total?: number
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          active_from: string
          active_to: string | null
          code: string
          label: string
        }
        Insert: {
          active_from: string
          active_to?: string | null
          code: string
          label: string
        }
        Update: {
          active_from?: string
          active_to?: string | null
          code?: string
          label?: string
        }
        Relationships: []
      }
      draw_rounds: {
        Row: {
          category_code: string | null
          cutoff_crs: number
          drawn_at: string
          ingested_at: string
          invitations: number
          program_code: string | null
          raw: Json
          round_number: string
          round_type: string
          source_url: string
          tie_break_at: string | null
        }
        Insert: {
          category_code?: string | null
          cutoff_crs: number
          drawn_at: string
          ingested_at?: string
          invitations: number
          program_code?: string | null
          raw: Json
          round_number: string
          round_type: string
          source_url: string
          tie_break_at?: string | null
        }
        Update: {
          category_code?: string | null
          cutoff_crs?: number
          drawn_at?: string
          ingested_at?: string
          invitations?: number
          program_code?: string | null
          raw?: Json
          round_number?: string
          round_type?: string
          source_url?: string
          tie_break_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "draw_rounds_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "draw_rounds_program_code_fkey"
            columns: ["program_code"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["code"]
          },
        ]
      }
      editors: {
        Row: {
          added_at: string
          user_id: string
        }
        Insert: {
          added_at?: string
          user_id: string
        }
        Update: {
          added_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ingestion_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: number
          rows_seen: number | null
          rows_written: number | null
          started_at: string
          status: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: number
          rows_seen?: number | null
          rows_written?: number | null
          started_at?: string
          status: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: number
          rows_seen?: number | null
          rows_written?: number | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      news_items: {
        Row: {
          external_id: string
          id: number
          published_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          summary: string | null
          tags: string[]
          title: string
          url: string
        }
        Insert: {
          external_id: string
          id?: number
          published_at: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          summary?: string | null
          tags?: string[]
          title: string
          url: string
        }
        Update: {
          external_id?: string
          id?: number
          published_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          summary?: string | null
          tags?: string[]
          title?: string
          url?: string
        }
        Relationships: []
      }
      pool_snapshots: {
        Row: {
          bucket_high: number
          bucket_low: number
          candidates: number
          captured_on: string
          id: number
          source_url: string
        }
        Insert: {
          bucket_high: number
          bucket_low: number
          candidates: number
          captured_on: string
          id?: number
          source_url: string
        }
        Update: {
          bucket_high?: number
          bucket_low?: number
          candidates?: number
          captured_on?: string
          id?: number
          source_url?: string
        }
        Relationships: []
      }
      programs: {
        Row: {
          active_from: string
          active_to: string | null
          code: string
          label: string
        }
        Insert: {
          active_from: string
          active_to?: string | null
          code: string
          label: string
        }
        Update: {
          active_from?: string
          active_to?: string | null
          code?: string
          label?: string
        }
        Relationships: []
      }
      quarantined_rows: {
        Row: {
          created_at: string
          id: number
          payload: Json
          reason: string
          resolved_at: string | null
          run_id: number | null
        }
        Insert: {
          created_at?: string
          id?: number
          payload: Json
          reason: string
          resolved_at?: string | null
          run_id?: number | null
        }
        Update: {
          created_at?: string
          id?: number
          payload?: Json
          reason?: string
          resolved_at?: string | null
          run_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quarantined_rows_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_sets: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          gazette_ref: string | null
          id: string
          label: string
          params: Json
          source_url: string
          status: string
        }
        Insert: {
          created_at?: string
          effective_from: string
          effective_to?: string | null
          gazette_ref?: string | null
          id: string
          label: string
          params: Json
          source_url: string
          status: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          gazette_ref?: string | null
          id?: string
          label?: string
          params?: Json
          source_url?: string
          status?: string
        }
        Relationships: []
      }
      saved_profiles: {
        Row: {
          profile: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          profile: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          profile?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      source_snapshots: {
        Row: {
          body: string
          content_hash: string
          fetched_at: string
          id: number
          url: string
        }
        Insert: {
          body: string
          content_hash: string
          fetched_at?: string
          id?: number
          url: string
        }
        Update: {
          body?: string
          content_hash?: string
          fetched_at?: string
          id?: number
          url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_own_account: { Args: never; Returns: undefined }
      is_editor: { Args: never; Returns: boolean }
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
    Enums: {},
  },
} as const
