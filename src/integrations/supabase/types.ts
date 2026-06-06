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
      ae_assignments: {
        Row: {
          ae_user_id: string
          created_at: string
          id: string
          wd_code: string
        }
        Insert: {
          ae_user_id: string
          created_at?: string
          id?: string
          wd_code: string
        }
        Update: {
          ae_user_id?: string
          created_at?: string
          id?: string
          wd_code?: string
        }
        Relationships: []
      }
      dispatch_plan_items: {
        Row: {
          actual_qty: number | null
          created_at: string
          id: string
          material_code: string
          plan_id: string
          planned_qty: number
        }
        Insert: {
          actual_qty?: number | null
          created_at?: string
          id?: string
          material_code: string
          plan_id: string
          planned_qty: number
        }
        Update: {
          actual_qty?: number | null
          created_at?: string
          id?: string
          material_code?: string
          plan_id?: string
          planned_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "dispatch_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_plans: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string
          dispatch_id: string | null
          executed_at: string | null
          executed_by: string | null
          id: string
          plan_code: string
          plan_date: string
          status: Database["public"]["Enums"]["dispatch_plan_status"]
          wd_code: string
          wsp: Database["public"]["Enums"]["wsp_code"]
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by: string
          dispatch_id?: string | null
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          plan_code: string
          plan_date?: string
          status?: Database["public"]["Enums"]["dispatch_plan_status"]
          wd_code: string
          wsp: Database["public"]["Enums"]["wsp_code"]
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          dispatch_id?: string | null
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          plan_code?: string
          plan_date?: string
          status?: Database["public"]["Enums"]["dispatch_plan_status"]
          wd_code?: string
          wsp?: Database["public"]["Enums"]["wsp_code"]
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      hierarchy_ae: {
        Row: {
          active: boolean
          ae_id: string
          ae_name: string
          created_at: string
          section_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          ae_id: string
          ae_name: string
          created_at?: string
          section_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          ae_id?: string
          ae_name?: string
          created_at?: string
          section_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      hierarchy_tl: {
        Row: {
          active: boolean
          created_at: string
          is_wd_receiver: boolean
          tl_id: string
          tl_name: string
          updated_at: string
          wd_code: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          is_wd_receiver?: boolean
          tl_id: string
          tl_name: string
          updated_at?: string
          wd_code: string
        }
        Update: {
          active?: boolean
          created_at?: string
          is_wd_receiver?: boolean
          tl_id?: string
          tl_name?: string
          updated_at?: string
          wd_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "hierarchy_tl_wd_code_fkey"
            columns: ["wd_code"]
            isOneToOne: false
            referencedRelation: "hierarchy_wd"
            referencedColumns: ["wd_code"]
          },
        ]
      }
      hierarchy_wd: {
        Row: {
          active: boolean
          ae_id: string
          created_at: string
          updated_at: string
          wd_code: string
          wd_name: string
        }
        Insert: {
          active?: boolean
          ae_id: string
          created_at?: string
          updated_at?: string
          wd_code: string
          wd_name: string
        }
        Update: {
          active?: boolean
          ae_id?: string
          created_at?: string
          updated_at?: string
          wd_code?: string
          wd_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "hierarchy_wd_ae_id_fkey"
            columns: ["ae_id"]
            isOneToOne: false
            referencedRelation: "hierarchy_ae"
            referencedColumns: ["ae_id"]
          },
        ]
      }
      loss_approvals: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          decision_remarks: string | null
          distributor: string | null
          id: string
          material_code: string
          movement_id: string
          proof_image_path: string | null
          qty: number
          reason: string
          status: Database["public"]["Enums"]["loss_approval_status"]
          submitted_at: string
          submitted_by: string
          submitted_by_role: string | null
          wsp: Database["public"]["Enums"]["wsp_code"]
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          decision_remarks?: string | null
          distributor?: string | null
          id?: string
          material_code: string
          movement_id: string
          proof_image_path?: string | null
          qty: number
          reason: string
          status?: Database["public"]["Enums"]["loss_approval_status"]
          submitted_at?: string
          submitted_by: string
          submitted_by_role?: string | null
          wsp: Database["public"]["Enums"]["wsp_code"]
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          decision_remarks?: string | null
          distributor?: string | null
          id?: string
          material_code?: string
          movement_id?: string
          proof_image_path?: string | null
          qty?: number
          reason?: string
          status?: Database["public"]["Enums"]["loss_approval_status"]
          submitted_at?: string
          submitted_by?: string
          submitted_by_role?: string | null
          wsp?: Database["public"]["Enums"]["wsp_code"]
        }
        Relationships: [
          {
            foreignKeyName: "loss_approvals_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      loss_approvers: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      master_data_audit: {
        Row: {
          changed_at: string
          changed_by: string
          entity_id: string
          entity_type: string
          field_changed: string
          id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          changed_at?: string
          changed_by: string
          entity_id: string
          entity_type: string
          field_changed: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          entity_id?: string
          entity_type?: string
          field_changed?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: []
      }
      materials: {
        Row: {
          code: string
          created_at: string
          image_path: string | null
          image_updated_at: string | null
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          image_path?: string | null
          image_updated_at?: string | null
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          image_path?: string | null
          image_updated_at?: string | null
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
          ae_id: string | null
          created_at: string
          display_name: string | null
          id: string
          mobile: string
          tl_id: string | null
          tl_type: string | null
          updated_at: string
          wd_code: string | null
          wsp: Database["public"]["Enums"]["wsp_code"] | null
        }
        Insert: {
          ae_id?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          mobile: string
          tl_id?: string | null
          tl_type?: string | null
          updated_at?: string
          wd_code?: string | null
          wsp?: Database["public"]["Enums"]["wsp_code"] | null
        }
        Update: {
          ae_id?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          mobile?: string
          tl_id?: string | null
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
          new_dispatch_date: string | null
          new_distributor: string | null
          new_material_code: string | null
          new_movement_id: string | null
          new_proof_image_path: string | null
          new_quantity: number
          new_received_date: string | null
          new_reference_number: string | null
          old_batch_type: Database["public"]["Enums"]["batch_type"] | null
          old_dispatch_date: string | null
          old_distributor: string | null
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
          new_dispatch_date?: string | null
          new_distributor?: string | null
          new_material_code?: string | null
          new_movement_id?: string | null
          new_proof_image_path?: string | null
          new_quantity: number
          new_received_date?: string | null
          new_reference_number?: string | null
          old_batch_type?: Database["public"]["Enums"]["batch_type"] | null
          old_dispatch_date?: string | null
          old_distributor?: string | null
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
          new_dispatch_date?: string | null
          new_distributor?: string | null
          new_material_code?: string | null
          new_movement_id?: string | null
          new_proof_image_path?: string | null
          new_quantity?: number
          new_received_date?: string | null
          new_reference_number?: string | null
          old_batch_type?: Database["public"]["Enums"]["batch_type"] | null
          old_dispatch_date?: string | null
          old_distributor?: string | null
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tl_inactivity_reasons: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          leave_until: string | null
          reason: string
          wd_code: string
          wd_tl_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          leave_until?: string | null
          reason: string
          wd_code: string
          wd_tl_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          leave_until?: string | null
          reason?: string
          wd_code?: string
          wd_tl_id?: string
        }
        Relationships: []
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
      tl_returns: {
        Row: {
          batch_id: string
          created_at: string
          created_by: string
          id: string
          material_code: string
          note: string | null
          qty: number
          wd_code: string
          wd_tl_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          created_by: string
          id?: string
          material_code: string
          note?: string | null
          qty: number
          wd_code: string
          wd_tl_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          created_by?: string
          id?: string
          material_code?: string
          note?: string | null
          qty?: number
          wd_code?: string
          wd_tl_id?: string
        }
        Relationships: []
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
      tl_usages: {
        Row: {
          created_at: string
          created_by: string
          id: string
          material_code: string
          note: string | null
          qty: number
          wd_code: string
          wd_tl_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          material_code: string
          note?: string | null
          qty: number
          wd_code: string
          wd_tl_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          material_code?: string
          note?: string | null
          qty?: number
          wd_code?: string
          wd_tl_id?: string
        }
        Relationships: []
      }
      tl_weekly_allocation_items: {
        Row: {
          allocation_id: string
          created_at: string
          id: string
          material_code: string
          qty_allocated: number
          qty_remaining: number | null
          qty_used: number | null
        }
        Insert: {
          allocation_id: string
          created_at?: string
          id?: string
          material_code: string
          qty_allocated: number
          qty_remaining?: number | null
          qty_used?: number | null
        }
        Update: {
          allocation_id?: string
          created_at?: string
          id?: string
          material_code?: string
          qty_allocated?: number
          qty_remaining?: number | null
          qty_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tl_weekly_allocation_items_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "tl_weekly_allocations"
            referencedColumns: ["id"]
          },
        ]
      }
      tl_weekly_allocations: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closure_note: string | null
          closure_proof_image_path: string | null
          created_at: string
          created_by: string
          id: string
          status: Database["public"]["Enums"]["tl_alloc_status"]
          wd_code: string
          wd_tl_id: string
          week_end: string
          week_start: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closure_note?: string | null
          closure_proof_image_path?: string | null
          created_at?: string
          created_by: string
          id?: string
          status?: Database["public"]["Enums"]["tl_alloc_status"]
          wd_code: string
          wd_tl_id: string
          week_end: string
          week_start: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closure_note?: string | null
          closure_proof_image_path?: string | null
          created_at?: string
          created_by?: string
          id?: string
          status?: Database["public"]["Enums"]["tl_alloc_status"]
          wd_code?: string
          wd_tl_id?: string
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "tl_weekly_allocations_wd_tl_id_fkey"
            columns: ["wd_tl_id"]
            isOneToOne: false
            referencedRelation: "wd_tls"
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
      wd_brand_images: {
        Row: {
          brand: string
          id: string
          image_path: string | null
          no_stock: boolean
          uploaded_at: string
          uploaded_by: string
          wd_code: string
        }
        Insert: {
          brand: string
          id?: string
          image_path?: string | null
          no_stock?: boolean
          uploaded_at?: string
          uploaded_by: string
          wd_code: string
        }
        Update: {
          brand?: string
          id?: string
          image_path?: string | null
          no_stock?: boolean
          uploaded_at?: string
          uploaded_by?: string
          wd_code?: string
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
      wd_stock_snapshots: {
        Row: {
          batch_id: string
          created_at: string
          created_by: string
          id: string
          material_code: string
          note: string | null
          proof_image_path: string
          qty_change: number | null
          qty_counted: number
          qty_previous: number | null
          snapshot_date: string
          wd_code: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          created_by: string
          id?: string
          material_code: string
          note?: string | null
          proof_image_path: string
          qty_change?: number | null
          qty_counted: number
          qty_previous?: number | null
          snapshot_date?: string
          wd_code: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          created_by?: string
          id?: string
          material_code?: string
          note?: string | null
          proof_image_path?: string
          qty_change?: number | null
          qty_counted?: number
          qty_previous?: number | null
          snapshot_date?: string
          wd_code?: string
        }
        Relationships: []
      }
      wd_tls: {
        Row: {
          created_at: string
          id: string
          legacy_tl_id: number | null
          tl_name: string
          tl_type: string | null
          updated_at: string
          user_id: string | null
          wd_code: string | null
          wd_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          legacy_tl_id?: number | null
          tl_name: string
          tl_type?: string | null
          updated_at?: string
          user_id?: string | null
          wd_code?: string | null
          wd_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          legacy_tl_id?: number | null
          tl_name?: string
          tl_type?: string | null
          updated_at?: string
          user_id?: string | null
          wd_code?: string | null
          wd_name?: string | null
        }
        Relationships: []
      }
      wd_transfer_items: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          issue_note: string | null
          item_status: Database["public"]["Enums"]["wd_transfer_item_status"]
          material_code: string
          qty_confirmed: number | null
          qty_requested: number
          transfer_id: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          issue_note?: string | null
          item_status?: Database["public"]["Enums"]["wd_transfer_item_status"]
          material_code: string
          qty_confirmed?: number | null
          qty_requested: number
          transfer_id: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          issue_note?: string | null
          item_status?: Database["public"]["Enums"]["wd_transfer_item_status"]
          material_code?: string
          qty_confirmed?: number | null
          qty_requested?: number
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wd_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "wd_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      wd_transfers: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          from_wd_code: string
          id: string
          note: string | null
          status: Database["public"]["Enums"]["wd_transfer_status"]
          to_wd_code: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          from_wd_code: string
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["wd_transfer_status"]
          to_wd_code: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          from_wd_code?: string
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["wd_transfer_status"]
          to_wd_code?: string
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
      _compute_streak_from_dates: {
        Args: { _dates: string[]; _today: string }
        Returns: number
      }
      _tl_activity_dates: { Args: { _wd_tl_id: string }; Returns: string[] }
      admin_assign_role: {
        Args: {
          _ae_wds?: string[]
          _role: string
          _target: string
          _tl_type: string
          _wd_code: string
          _wsp: Database["public"]["Enums"]["wsp_code"]
        }
        Returns: undefined
      }
      admin_assign_wd_to_tl: {
        Args: { _wd_code: string; _wd_name?: string; _wd_tl_id: string }
        Returns: undefined
      }
      admin_import_hierarchy: { Args: { _rows: Json }; Returns: Json }
      admin_import_wd_stock: { Args: { _rows: Json }; Returns: Json }
      admin_toggle_super_admin: {
        Args: { _on: boolean; _target: string }
        Returns: undefined
      }
      close_weekly_tl_allocation: {
        Args: {
          _allocation_id: string
          _note?: string
          _proof_image_path: string
          _remaining: Json
        }
        Returns: string
      }
      confirm_dispatch_item: {
        Args: {
          _action: string
          _movement_id: string
          _note?: string
          _received_qty?: number
        }
        Returns: Database["public"]["Enums"]["dispatch_item_status"]
      }
      confirm_wd_transfer_item: {
        Args: {
          _action: string
          _confirmed_qty?: number
          _item_id: string
          _note?: string
        }
        Returns: Database["public"]["Enums"]["wd_transfer_item_status"]
      }
      create_wd_transfer: {
        Args: { _items: Json; _note?: string; _to_wd_code: string }
        Returns: string
      }
      create_weekly_tl_allocation: {
        Args: { _items: Json; _wd_tl_id: string }
        Returns: string
      }
      current_user_ae_wds: { Args: never; Returns: string[] }
      current_user_tl_is_wd_receiver: { Args: never; Returns: boolean }
      current_user_tl_wd_code: { Args: never; Returns: string }
      current_user_wd: { Args: never; Returns: string }
      current_user_wd_tl_id: { Args: never; Returns: string }
      current_user_wsp: {
        Args: never
        Returns: Database["public"]["Enums"]["wsp_code"]
      }
      decide_loss_approval: {
        Args: { _approval_id: string; _decision: string; _remarks?: string }
        Returns: Database["public"]["Enums"]["loss_approval_status"]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
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
      edit_dispatch_entry: {
        Args: {
          _movement_id: string
          _new_dispatch_date: string
          _new_distributor: string
          _new_proof_image_path: string
          _new_qty: number
          _reason: string
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
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_ae_tl_team_report: {
        Args: { _ae_id: string; _inactivity_days?: number }
        Returns: {
          current_streak: number
          is_wd_receiver: boolean
          last_activity: string
          material_types: number
          status: string
          tl_id: string
          tl_name: string
          tl_stock_units: number
          wd_code: string
          wd_name: string
        }[]
      }
      get_tl_activity_report: {
        Args: { _inactivity_days?: number }
        Returns: {
          ae_id: string
          ae_name: string
          current_streak: number
          last_activity: string
          status: string
          tl_id: string
          tl_name: string
          wd_code: string
          wd_name: string
        }[]
      }
      get_tl_streak: { Args: { _wd_tl_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_loss_approver: { Args: { _uid: string }; Returns: boolean }
      iso_week_monday: { Args: { _d: string }; Returns: string }
      issue_to_tl: {
        Args: { _issue_date: string; _items: Json; _tl_user_id: string }
        Returns: string
      }
      issue_to_tl_v2: {
        Args: { _issue_date: string; _items: Json; _wd_tl_id: string }
        Returns: string
      }
      list_manageable_users: {
        Args: never
        Returns: {
          ae_wds: string[]
          allowed_wsps: string[]
          created_at: string
          display_name: string
          id: string
          mobile: string
          roles: string[]
          tl_type: string
          wd_code: string
          wsp: Database["public"]["Enums"]["wsp_code"]
        }[]
      }
      list_pending_tl_setups: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          legacy_tl_id: number
          mobile: string
          user_id: string
          wd_tl_id: string
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
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
      record_wd_stock_snapshot: {
        Args: {
          _items: Json
          _note?: string
          _proof_image_path: string
          _snapshot_date?: string
        }
        Returns: string
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
      return_from_tl: {
        Args: { _items: Json; _note?: string; _wd_tl_id: string }
        Returns: string
      }
      submit_loss_approval: {
        Args: {
          _movement_id: string
          _proof_image_path?: string
          _reason: string
        }
        Returns: string
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
      tl_carry_forward: {
        Args: { _wd_tl_id: string }
        Returns: {
          material_code: string
          qty: number
        }[]
      }
      tl_self_return: {
        Args: { _material_code: string; _note?: string; _qty: number }
        Returns: string
      }
      tl_self_take: {
        Args: { _material_code: string; _qty: number }
        Returns: string
      }
      tl_self_used: {
        Args: { _material_code: string; _note?: string; _qty: number }
        Returns: string
      }
      user_admin_scope: {
        Args: { _user_id: string }
        Returns: {
          ae_wds: string[]
          is_super: boolean
          wd_scope: string
          wsp_scope: Database["public"]["Enums"]["wsp_code"]
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "wsp" | "wd" | "tl" | "wsp_admin" | "wd_admin"
      batch_type: "Launch" | "Cyclical" | "SOV" | "Others"
      concern_reason: "shortage" | "damage" | "other"
      concern_status: "pending" | "approved" | "rejected"
      dispatch_item_status:
        | "pending"
        | "received"
        | "issue"
        | "closed_loss"
        | "resolved"
        | "pending_loss_approval"
      dispatch_plan_status: "pending" | "executed" | "cancelled"
      loss_approval_status: "pending" | "approved" | "rejected"
      movement_type: "receive" | "dispatch" | "tl_issue"
      tl_alloc_status: "open" | "closed"
      wd_transfer_item_status: "pending" | "received" | "partial" | "issue"
      wd_transfer_status: "pending" | "completed" | "cancelled"
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
      app_role: ["admin", "wsp", "wd", "tl", "wsp_admin", "wd_admin"],
      batch_type: ["Launch", "Cyclical", "SOV", "Others"],
      concern_reason: ["shortage", "damage", "other"],
      concern_status: ["pending", "approved", "rejected"],
      dispatch_item_status: [
        "pending",
        "received",
        "issue",
        "closed_loss",
        "resolved",
        "pending_loss_approval",
      ],
      dispatch_plan_status: ["pending", "executed", "cancelled"],
      loss_approval_status: ["pending", "approved", "rejected"],
      movement_type: ["receive", "dispatch", "tl_issue"],
      tl_alloc_status: ["open", "closed"],
      wd_transfer_item_status: ["pending", "received", "partial", "issue"],
      wd_transfer_status: ["pending", "completed", "cancelled"],
      wsp_code: ["CEVL", "CEVJ", "CEVY"],
    },
  },
} as const
