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
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          related_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          related_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          related_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          mobile: string
          tl_type: string | null
          updated_at: string
          wd_code: string | null
          wsp: Database["public"]["Enums"]["wsp_code"] | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          mobile: string
          tl_type?: string | null
          updated_at?: string
          wd_code?: string | null
          wsp?: Database["public"]["Enums"]["wsp_code"] | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          mobile?: string
          tl_type?: string | null
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
      stock_concerns: {
        Row: {
          actual_qty: number
          created_at: string
          created_by: string
          difference: number
          id: string
          material_code: string
          note: string | null
          proof_image_path: string | null
          reason: Database["public"]["Enums"]["concern_reason"]
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["concern_status"]
          system_qty: number
          wsp: Database["public"]["Enums"]["wsp_code"]
        }
        Insert: {
          actual_qty: number
          created_at?: string
          created_by: string
          difference: number
          id?: string
          material_code: string
          note?: string | null
          proof_image_path?: string | null
          reason: Database["public"]["Enums"]["concern_reason"]
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["concern_status"]
          system_qty: number
          wsp: Database["public"]["Enums"]["wsp_code"]
        }
        Update: {
          actual_qty?: number
          created_at?: string
          created_by?: string
          difference?: number
          id?: string
          material_code?: string
          note?: string | null
          proof_image_path?: string | null
          reason?: Database["public"]["Enums"]["concern_reason"]
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["concern_status"]
          system_qty?: number
          wsp?: Database["public"]["Enums"]["wsp_code"]
        }
        Relationships: []
      }
      stock_movement_edits: {
        Row: {
          edit_reason: string
          edited_at: string
          edited_by: string
          id: string
          movement_id: string
          new_batch_type: Database["public"]["Enums"]["batch_type"] | null
          new_material_code: string | null
          new_movement_id: string | null
          new_proof_image_path: string | null
          new_quantity: number
          new_received_date: string | null
          new_reference_number: string | null
          old_batch_type: Database["public"]["Enums"]["batch_type"] | null
          old_material_code: string | null
          old_proof_image_path: string | null
          old_quantity: number
          old_received_date: string | null
          old_reference_number: string | null
        }
        Insert: {
          edit_reason: string
          edited_at?: string
          edited_by: string
          id?: string
          movement_id: string
          new_batch_type?: Database["public"]["Enums"]["batch_type"] | null
          new_material_code?: string | null
          new_movement_id?: string | null
          new_proof_image_path?: string | null
          new_quantity: number
          new_received_date?: string | null
          new_reference_number?: string | null
          old_batch_type?: Database["public"]["Enums"]["batch_type"] | null
          old_material_code?: string | null
          old_proof_image_path?: string | null
          old_quantity: number
          old_received_date?: string | null
          old_reference_number?: string | null
        }
        Update: {
          edit_reason?: string
          edited_at?: string
          edited_by?: string
          id?: string
          movement_id?: string
          new_batch_type?: Database["public"]["Enums"]["batch_type"] | null
          new_material_code?: string | null
          new_movement_id?: string | null
          new_proof_image_path?: string | null
          new_quantity?: number
          new_received_date?: string | null
          new_reference_number?: string | null
          old_batch_type?: Database["public"]["Enums"]["batch_type"] | null
          old_material_code?: string | null
          old_proof_image_path?: string | null
          old_quantity?: number
          old_received_date?: string | null
          old_reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movement_edits_new_movement_id_fkey"
            columns: ["new_movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          batch_type: Database["public"]["Enums"]["batch_type"] | null
          confirmed_at: string | null
          confirmed_by: string | null
          corrected_at: string | null
          corrected_by: string | null
          corrected_by_movement_id: string | null
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
          parent_movement_id: string | null
          performed_by: string | null
          proof_image_path: string | null
          qty: number
          receive_id: string | null
          received_date: string | null
          reference_number: string | null
          resolved_at: string | null
          resolved_by: string | null
          wsp: Database["public"]["Enums"]["wsp_code"]
        }
        Insert: {
          batch_type?: Database["public"]["Enums"]["batch_type"] | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          corrected_at?: string | null
          corrected_by?: string | null
          corrected_by_movement_id?: string | null
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
          parent_movement_id?: string | null
          performed_by?: string | null
          proof_image_path?: string | null
          qty: number
          receive_id?: string | null
          received_date?: string | null
          reference_number?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          wsp: Database["public"]["Enums"]["wsp_code"]
        }
        Update: {
          batch_type?: Database["public"]["Enums"]["batch_type"] | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          corrected_at?: string | null
          corrected_by?: string | null
          corrected_by_movement_id?: string | null
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
          parent_movement_id?: string | null
          performed_by?: string | null
          proof_image_path?: string | null
          qty?: number
          receive_id?: string | null
          received_date?: string | null
          reference_number?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          wsp?: Database["public"]["Enums"]["wsp_code"]
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_corrected_by_movement_id_fkey"
            columns: ["corrected_by_movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_material_code_fkey"
            columns: ["material_code"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "stock_movements_parent_movement_id_fkey"
            columns: ["parent_movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      tl_issuance_items: {
        Row: {
          created_at: string
          id: string
          issuance_id: string
          material_code: string
          qty_issued: number
          qty_used: number
        }
        Insert: {
          created_at?: string
          id?: string
          issuance_id: string
          material_code: string
          qty_issued: number
          qty_used?: number
        }
        Update: {
          created_at?: string
          id?: string
          issuance_id?: string
          material_code?: string
          qty_issued?: number
          qty_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "tl_issuance_items_issuance_id_fkey"
            columns: ["issuance_id"]
            isOneToOne: false
            referencedRelation: "tl_issuances"
            referencedColumns: ["id"]
          },
        ]
      }
      tl_issuances: {
        Row: {
          created_at: string
          id: string
          issue_date: string
          issued_by: string | null
          tl_user_id: string | null
          wd_code: string
          wd_tl_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          issue_date?: string
          issued_by?: string | null
          tl_user_id?: string | null
          wd_code: string
          wd_tl_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          issue_date?: string
          issued_by?: string | null
          tl_user_id?: string | null
          wd_code?: string
          wd_tl_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tl_issuances_wd_tl_id_fkey"
            columns: ["wd_tl_id"]
            isOneToOne: false
            referencedRelation: "wd_tls"
            referencedColumns: ["id"]
          },
        ]
      }
      tl_uploads: {
        Row: {
          created_at: string
          id: string
          issuance_item_id: string
          performed_by: string | null
          proof_image_path: string
          qty: number
        }
        Insert: {
          created_at?: string
          id?: string
          issuance_item_id: string
          performed_by?: string | null
          proof_image_path: string
          qty: number
        }
        Update: {
          created_at?: string
          id?: string
          issuance_item_id?: string
          performed_by?: string | null
          proof_image_path?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "tl_uploads_issuance_item_id_fkey"
            columns: ["issuance_item_id"]
            isOneToOne: false
            referencedRelation: "tl_issuance_items"
            referencedColumns: ["id"]
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
      wd_tls: {
        Row: {
          created_at: string
          id: string
          legacy_tl_id: number | null
          tl_name: string
          tl_type: string | null
          updated_at: string
          wd_code: string
          wd_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          legacy_tl_id?: number | null
          tl_name: string
          tl_type?: string | null
          updated_at?: string
          wd_code: string
          wd_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          legacy_tl_id?: number | null
          tl_name?: string
          tl_type?: string | null
          updated_at?: string
          wd_code?: string
          wd_name?: string | null
        }
        Relationships: []
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
        Args: {
          _action: string
          _movement_id: string
          _note?: string
          _received_qty?: number
        }
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
      edit_receive_entry: {
        Args: {
          _movement_id: string
          _new_batch_type: Database["public"]["Enums"]["batch_type"]
          _new_material_code: string
          _new_proof_image_path: string
          _new_qty: number
          _new_received_date: string
          _new_reference_number: string
          _reason: string
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
      issue_to_tl: {
        Args: { _issue_date: string; _items: Json; _tl_user_id: string }
        Returns: string
      }
      issue_to_tl_v2: {
        Args: { _issue_date: string; _items: Json; _wd_tl_id: string }
        Returns: string
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
      receive_material_with_create:
        | {
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
        | {
            Args: {
              _batch_type?: Database["public"]["Enums"]["batch_type"]
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
      record_tl_upload: {
        Args: {
          _issuance_item_id: string
          _proof_image_path: string
          _qty: number
        }
        Returns: number
      }
      request_movement_correction: {
        Args: { _movement_id: string; _new_qty: number; _reason: string }
        Returns: number
      }
      resolve_dispatch_issue: {
        Args: {
          _action: string
          _movement_id: string
          _proof_image_path?: string
          _redispatch_qty?: number
        }
        Returns: Database["public"]["Enums"]["dispatch_item_status"]
      }
      resolve_stock_concern: {
        Args: {
          _action: string
          _concern_id: string
          _resolution_note?: string
        }
        Returns: Database["public"]["Enums"]["concern_status"]
      }
      submit_stock_concern: {
        Args: {
          _actual_qty: number
          _material_code: string
          _note?: string
          _proof_image_path?: string
          _reason: Database["public"]["Enums"]["concern_reason"]
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "wsp" | "wd" | "tl"
      batch_type: "Launch" | "Cyclical" | "SOV" | "Others"
      concern_reason: "shortage" | "damage" | "other"
      concern_status: "pending" | "approved" | "rejected"
      dispatch_item_status:
        | "pending"
        | "received"
        | "issue"
        | "closed_loss"
        | "resolved"
      movement_type: "receive" | "dispatch" | "tl_issue"
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
      concern_reason: ["shortage", "damage", "other"],
      concern_status: ["pending", "approved", "rejected"],
      dispatch_item_status: [
        "pending",
        "received",
        "issue",
        "closed_loss",
        "resolved",
      ],
      movement_type: ["receive", "dispatch", "tl_issue"],
      wsp_code: ["CEVL", "CEVJ", "CEVY"],
    },
  },
} as const
