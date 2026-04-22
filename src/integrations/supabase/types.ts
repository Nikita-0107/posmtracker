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
      materials: {
        Row: {
          code: string
          created_at: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          mobile: string
          updated_at: string
          wd_code: string | null
          wsp: Database["public"]["Enums"]["wsp_code"] | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          mobile: string
          updated_at?: string
          wd_code?: string | null
          wsp?: Database["public"]["Enums"]["wsp_code"] | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          mobile?: string
          updated_at?: string
          wd_code?: string | null
          wsp?: Database["public"]["Enums"]["wsp_code"] | null
        }
        Relationships: []
      }
      stock: {
        Row: {
          id: string
          material_code: string
          qty: number
          updated_at: string
          wsp: Database["public"]["Enums"]["wsp_code"]
        }
        Insert: {
          id?: string
          material_code: string
          qty?: number
          updated_at?: string
          wsp: Database["public"]["Enums"]["wsp_code"]
        }
        Update: {
          id?: string
          material_code?: string
          qty?: number
          updated_at?: string
          wsp?: Database["public"]["Enums"]["wsp_code"]
        }
        Relationships: [
          {
            foreignKeyName: "stock_material_code_fkey"
            columns: ["material_code"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["code"]
          },
        ]
      }
      stock_movements: {
        Row: {
          batch_type: Database["public"]["Enums"]["batch_type"] | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          dispatch_date: string | null
          dispatch_id: string | null
          distributor: string | null
          id: string
          invoice_file_path: string | null
          issue_note: string | null
          item_status:
            | Database["public"]["Enums"]["dispatch_item_status"]
            | null
          material_code: string
          movement: Database["public"]["Enums"]["movement_type"]
          performed_by: string | null
          proof_image_path: string | null
          qty: number
          receive_id: string | null
          received_date: string | null
          reference_number: string | null
          wsp: Database["public"]["Enums"]["wsp_code"]
        }
        Insert: {
          batch_type?: Database["public"]["Enums"]["batch_type"] | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          dispatch_date?: string | null
          dispatch_id?: string | null
          distributor?: string | null
          id?: string
          invoice_file_path?: string | null
          issue_note?: string | null
          item_status?:
            | Database["public"]["Enums"]["dispatch_item_status"]
            | null
          material_code: string
          movement: Database["public"]["Enums"]["movement_type"]
          performed_by?: string | null
          proof_image_path?: string | null
          qty: number
          receive_id?: string | null
          received_date?: string | null
          reference_number?: string | null
          wsp: Database["public"]["Enums"]["wsp_code"]
        }
        Update: {
          batch_type?: Database["public"]["Enums"]["batch_type"] | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          dispatch_date?: string | null
          dispatch_id?: string | null
          distributor?: string | null
          id?: string
          invoice_file_path?: string | null
          issue_note?: string | null
          item_status?:
            | Database["public"]["Enums"]["dispatch_item_status"]
            | null
          material_code?: string
          movement?: Database["public"]["Enums"]["movement_type"]
          performed_by?: string | null
          proof_image_path?: string | null
          qty?: number
          receive_id?: string | null
          received_date?: string | null
          reference_number?: string | null
          wsp?: Database["public"]["Enums"]["wsp_code"]
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_material_code_fkey"
            columns: ["material_code"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["code"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wd_assignments: {
        Row: {
          created_at: string
          id: string
          wd_code: string
          wsp: Database["public"]["Enums"]["wsp_code"]
        }
        Insert: {
          created_at?: string
          id?: string
          wd_code: string
          wsp: Database["public"]["Enums"]["wsp_code"]
        }
        Update: {
          created_at?: string
          id?: string
          wd_code?: string
          wsp?: Database["public"]["Enums"]["wsp_code"]
        }
        Relationships: []
      }
      wd_stock: {
        Row: {
          id: string
          material_code: string
          qty: number
          updated_at: string
          wd_code: string
        }
        Insert: {
          id?: string
          material_code: string
          qty?: number
          updated_at?: string
          wd_code: string
        }
        Update: {
          id?: string
          material_code?: string
          qty?: number
          updated_at?: string
          wd_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "wd_stock_material_code_fkey"
            columns: ["material_code"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Views: {
      dispatch_status_v: {
        Row: {
          dispatch_id: string | null
          issue_items: number | null
          pending_items: number | null
          received_items: number | null
          status: string | null
          total_items: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      confirm_dispatch_item: {
        Args: { _action: string; _movement_id: string; _note?: string }
        Returns: Database["public"]["Enums"]["dispatch_item_status"]
      }
      current_user_wd: { Args: never; Returns: string }
      current_user_wsp: {
        Args: never
        Returns: Database["public"]["Enums"]["wsp_code"]
      }
      dispatch_material: {
        Args: {
          _distributor: string
          _material_code: string
          _proof_image_path: string
          _qty: number
        }
        Returns: number
      }
      dispatch_materials: {
        Args: {
          _dispatch_date?: string
          _distributor: string
          _items: Json
          _proof_image_path: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      receive_material:
        | {
            Args: {
              _material_code: string
              _proof_image_path: string
              _qty: number
              _reference_number: string
            }
            Returns: number
          }
        | {
            Args: {
              _batch_type?: Database["public"]["Enums"]["batch_type"]
              _material_code: string
              _proof_image_path: string
              _qty: number
              _received_date?: string
              _reference_number: string
            }
            Returns: number
          }
      receive_material_with_create: {
        Args: {
          _batch_type?: Database["public"]["Enums"]["batch_type"]
          _invoice_file_path?: string
          _material_code: string
          _material_name: string
          _proof_image_path: string
          _qty: number
          _received_date?: string
          _reference_number: string
        }
        Returns: number
      }
      receive_materials: {
        Args: {
          _batch_type?: Database["public"]["Enums"]["batch_type"]
          _items: Json
          _proof_image_path: string
          _received_date?: string
          _reference_number: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "wsp" | "wd" | "tl"
      batch_type: "Launch" | "Cyclical" | "SOV" | "Others"
      dispatch_item_status: "pending" | "received" | "issue"
      movement_type: "receive" | "dispatch"
      wsp_code: "CEVL" | "CEVJ" | "CEVY"
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

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "wsp", "wd", "tl"],
      batch_type: ["Launch", "Cyclical", "SOV", "Others"],
      dispatch_item_status: ["pending", "received", "issue"],
      movement_type: ["receive", "dispatch"],
      wsp_code: ["CEVL", "CEVJ", "CEVY"],
    },
  },
} as const
