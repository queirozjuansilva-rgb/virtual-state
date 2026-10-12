// Gerado por `supabase gen types` (não edite à mão). Rode `npm run db:types`.
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      analysis_runs: {
        Row: {
          conversation_id: string | null
          created_at: string
          created_by: string
          engine_version: string
          id: string
          input: Json
          land_id: string | null
          organization_id: string
          output: Json
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          engine_version: string
          id?: string
          input: Json
          land_id?: string | null
          organization_id?: string
          output: Json
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          engine_version?: string
          id?: string
          input?: Json
          land_id?: string | null
          organization_id?: string
          output?: Json
        }
        Relationships: [
          {
            foreignKeyName: "analysis_runs_conversation_fk"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_runs_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      analyst_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          report_id: string
          report_version_id: string | null
          reviewer_id: string
          verdict: Database["public"]["Enums"]["review_verdict"]
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          report_id: string
          report_version_id?: string | null
          reviewer_id?: string
          verdict: Database["public"]["Enums"]["review_verdict"]
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          report_id?: string
          report_version_id?: string | null
          reviewer_id?: string
          verdict?: Database["public"]["Enums"]["review_verdict"]
        }
        Relationships: [
          {
            foreignKeyName: "analyst_reviews_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analyst_reviews_report_version_id_fkey"
            columns: ["report_version_id"]
            isOneToOne: false
            referencedRelation: "report_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          conversation_id: string
          created_at: string
          file_name: string
          id: string
          message_id: string | null
          mime_type: string
          size_bytes: number
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          file_name: string
          id?: string
          message_id?: string | null
          mime_type: string
          size_bytes: number
          storage_path: string
          uploaded_by?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          file_name?: string
          id?: string
          message_id?: string | null
          mime_type?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: number
          new_data: Json | null
          old_data: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          land_id: string | null
          organization_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          land_id?: string | null
          organization_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          land_id?: string | null
          organization_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      coverage_requests: {
        Row: {
          address: string | null
          admin_notes: string | null
          created_at: string
          ibge_code: string | null
          id: string
          municipality_name: string
          organization_id: string
          requested_by: string
          status: Database["public"]["Enums"]["coverage_request_status"]
          uf: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          admin_notes?: string | null
          created_at?: string
          ibge_code?: string | null
          id?: string
          municipality_name: string
          organization_id?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["coverage_request_status"]
          uf: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          admin_notes?: string | null
          created_at?: string
          ibge_code?: string | null
          id?: string
          municipality_name?: string
          organization_id?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["coverage_request_status"]
          uf?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coverage_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cub_values: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          reference_month: string
          source: string
          source_url: string | null
          standard: string
          uf: string
          value_m2: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          reference_month: string
          source: string
          source_url?: string | null
          standard: string
          uf: string
          value_m2: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          reference_month?: string
          source?: string
          source_url?: string | null
          standard?: string
          uf?: string
          value_m2?: number
        }
        Relationships: []
      }
      environmental_layers: {
        Row: {
          created_at: string
          geojson: Json | null
          geom: unknown
          id: string
          is_fictitious: boolean
          kind: Database["public"]["Enums"]["environmental_layer_kind"]
          legal_document_id: string | null
          municipality_id: string
          name: string
          source: string
        }
        Insert: {
          created_at?: string
          geojson?: Json | null
          geom: unknown
          id?: string
          is_fictitious?: boolean
          kind: Database["public"]["Enums"]["environmental_layer_kind"]
          legal_document_id?: string | null
          municipality_id: string
          name: string
          source: string
        }
        Update: {
          created_at?: string
          geojson?: Json | null
          geom?: unknown
          id?: string
          is_fictitious?: boolean
          kind?: Database["public"]["Enums"]["environmental_layer_kind"]
          legal_document_id?: string | null
          municipality_id?: string
          name?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "environmental_layers_legal_document_id_fkey"
            columns: ["legal_document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "environmental_layers_municipality_id_fkey"
            columns: ["municipality_id"]
            isOneToOne: false
            referencedRelation: "municipalities"
            referencedColumns: ["id"]
          },
        ]
      }
      feasibility_defaults: {
        Row: {
          description: string
          key: string
          source: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description: string
          key: string
          source: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string
          key?: string
          source?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      investor_profiles: {
        Row: {
          acquisition_models: Database["public"]["Enums"]["acquisition_model"][]
          created_at: string
          horizon_months: number | null
          id: string
          min_margin: number | null
          organization_id: string
          regions: string[]
          risk_tolerance: Database["public"]["Enums"]["risk_tolerance"] | null
          ticket_max: number | null
          ticket_min: number | null
          typologies: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          acquisition_models?: Database["public"]["Enums"]["acquisition_model"][]
          created_at?: string
          horizon_months?: number | null
          id?: string
          min_margin?: number | null
          organization_id: string
          regions?: string[]
          risk_tolerance?: Database["public"]["Enums"]["risk_tolerance"] | null
          ticket_max?: number | null
          ticket_min?: number | null
          typologies?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          acquisition_models?: Database["public"]["Enums"]["acquisition_model"][]
          created_at?: string
          horizon_months?: number | null
          id?: string
          min_margin?: number | null
          organization_id?: string
          regions?: string[]
          risk_tolerance?: Database["public"]["Enums"]["risk_tolerance"] | null
          ticket_max?: number | null
          ticket_min?: number | null
          typologies?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      land_documents: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["land_document_kind"]
          land_id: string
          name: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["land_document_kind"]
          land_id: string
          name: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["land_document_kind"]
          land_id?: string
          name?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "land_documents_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
        ]
      }
      land_owner_contacts: {
        Row: {
          email: string | null
          land_id: string
          notes: string | null
          owner_name: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          email?: string | null
          land_id: string
          notes?: string | null
          owner_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          email?: string | null
          land_id?: string
          notes?: string | null
          owner_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "land_owner_contacts_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: true
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
        ]
      }
      land_photos: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          land_id: string
          position: number
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          land_id: string
          position?: number
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          land_id?: string
          position?: number
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "land_photos_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
        ]
      }
      lands: {
        Row: {
          address: string
          area_calculada_m2: number | null
          area_informada_m2: number | null
          area_m2: number | null
          cartorio: string | null
          centroid: unknown
          cep: string | null
          code: string
          created_at: string
          created_by: string | null
          declividade_pct: number | null
          esquina: boolean
          formato: Database["public"]["Enums"]["land_shape"] | null
          geojson: Json | null
          geom: unknown
          id: string
          is_fictitious: boolean
          matricula_numero: string | null
          municipality_id: string
          negociacao: Database["public"]["Enums"]["negotiation_type"] | null
          neighborhood: string | null
          observacoes: string | null
          onus: string | null
          permuta_pct: number | null
          preco_pedido: number | null
          restricoes_obs: string | null
          status: Database["public"]["Enums"]["land_status"]
          tem_app: boolean
          tem_area_alagavel: boolean
          tem_faixa_dominio: boolean
          tem_servidao: boolean
          tem_tombamento: boolean
          testada_principal_m: number | null
          testadas_m: number[]
          topografia: Database["public"]["Enums"]["topography"] | null
          updated_at: string
          zone_assignment: Database["public"]["Enums"]["zone_assignment"]
          zone_id: string | null
          zones_overlap_count: number
        }
        Insert: {
          address: string
          area_calculada_m2?: number | null
          area_informada_m2?: number | null
          area_m2?: number | null
          cartorio?: string | null
          centroid?: unknown
          cep?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          declividade_pct?: number | null
          esquina?: boolean
          formato?: Database["public"]["Enums"]["land_shape"] | null
          geojson?: Json | null
          geom?: unknown
          id?: string
          is_fictitious?: boolean
          matricula_numero?: string | null
          municipality_id: string
          negociacao?: Database["public"]["Enums"]["negotiation_type"] | null
          neighborhood?: string | null
          observacoes?: string | null
          onus?: string | null
          permuta_pct?: number | null
          preco_pedido?: number | null
          restricoes_obs?: string | null
          status?: Database["public"]["Enums"]["land_status"]
          tem_app?: boolean
          tem_area_alagavel?: boolean
          tem_faixa_dominio?: boolean
          tem_servidao?: boolean
          tem_tombamento?: boolean
          testada_principal_m?: number | null
          testadas_m?: number[]
          topografia?: Database["public"]["Enums"]["topography"] | null
          updated_at?: string
          zone_assignment?: Database["public"]["Enums"]["zone_assignment"]
          zone_id?: string | null
          zones_overlap_count?: number
        }
        Update: {
          address?: string
          area_calculada_m2?: number | null
          area_informada_m2?: number | null
          area_m2?: number | null
          cartorio?: string | null
          centroid?: unknown
          cep?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          declividade_pct?: number | null
          esquina?: boolean
          formato?: Database["public"]["Enums"]["land_shape"] | null
          geojson?: Json | null
          geom?: unknown
          id?: string
          is_fictitious?: boolean
          matricula_numero?: string | null
          municipality_id?: string
          negociacao?: Database["public"]["Enums"]["negotiation_type"] | null
          neighborhood?: string | null
          observacoes?: string | null
          onus?: string | null
          permuta_pct?: number | null
          preco_pedido?: number | null
          restricoes_obs?: string | null
          status?: Database["public"]["Enums"]["land_status"]
          tem_app?: boolean
          tem_area_alagavel?: boolean
          tem_faixa_dominio?: boolean
          tem_servidao?: boolean
          tem_tombamento?: boolean
          testada_principal_m?: number | null
          testadas_m?: number[]
          topografia?: Database["public"]["Enums"]["topography"] | null
          updated_at?: string
          zone_assignment?: Database["public"]["Enums"]["zone_assignment"]
          zone_id?: string | null
          zones_overlap_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "lands_municipality_id_fkey"
            columns: ["municipality_id"]
            isOneToOne: false
            referencedRelation: "municipalities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lands_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_chunks: {
        Row: {
          article: string | null
          chunk_index: number
          content: string
          created_at: string
          embedding: string | null
          id: string
          legal_document_id: string
          tsv: unknown
        }
        Insert: {
          article?: string | null
          chunk_index: number
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          legal_document_id: string
          tsv?: unknown
        }
        Update: {
          article?: string | null
          chunk_index?: number
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          legal_document_id?: string
          tsv?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "legal_chunks_legal_document_id_fkey"
            columns: ["legal_document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string | null
          effective_until: string | null
          id: string
          is_fictitious: boolean
          kind: Database["public"]["Enums"]["legal_document_kind"]
          municipality_id: string
          notes: string | null
          number: string
          official_url: string | null
          published_on: string | null
          storage_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          is_fictitious?: boolean
          kind: Database["public"]["Enums"]["legal_document_kind"]
          municipality_id: string
          notes?: string | null
          number: string
          official_url?: string | null
          published_on?: string | null
          storage_path?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          is_fictitious?: boolean
          kind?: Database["public"]["Enums"]["legal_document_kind"]
          municipality_id?: string
          notes?: string | null
          number?: string
          official_url?: string | null
          published_on?: string | null
          storage_path?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_documents_municipality_id_fkey"
            columns: ["municipality_id"]
            isOneToOne: false
            referencedRelation: "municipalities"
            referencedColumns: ["id"]
          },
        ]
      }
      market_comparables: {
        Row: {
          address: string | null
          bedrooms: number | null
          created_at: string
          geom: unknown
          id: string
          is_fictitious: boolean
          kind: Database["public"]["Enums"]["comparable_kind"]
          municipality_id: string
          neighborhood: string | null
          notes: string | null
          observed_on: string
          price: number
          price_m2: number | null
          private_area_m2: number
          source: string
          source_url: string | null
          typology: Database["public"]["Enums"]["comparable_typology"]
        }
        Insert: {
          address?: string | null
          bedrooms?: number | null
          created_at?: string
          geom: unknown
          id?: string
          is_fictitious?: boolean
          kind?: Database["public"]["Enums"]["comparable_kind"]
          municipality_id: string
          neighborhood?: string | null
          notes?: string | null
          observed_on: string
          price: number
          price_m2?: number | null
          private_area_m2: number
          source: string
          source_url?: string | null
          typology: Database["public"]["Enums"]["comparable_typology"]
        }
        Update: {
          address?: string | null
          bedrooms?: number | null
          created_at?: string
          geom?: unknown
          id?: string
          is_fictitious?: boolean
          kind?: Database["public"]["Enums"]["comparable_kind"]
          municipality_id?: string
          neighborhood?: string | null
          notes?: string | null
          observed_on?: string
          price?: number
          price_m2?: number | null
          private_area_m2?: number
          source?: string
          source_url?: string | null
          typology?: Database["public"]["Enums"]["comparable_typology"]
        }
        Relationships: [
          {
            foreignKeyName: "market_comparables_municipality_id_fkey"
            columns: ["municipality_id"]
            isOneToOne: false
            referencedRelation: "municipalities"
            referencedColumns: ["id"]
          },
        ]
      }
      market_indicators: {
        Row: {
          avg_price_m2: number | null
          created_at: string
          id: string
          municipality_id: string
          neighborhood: string | null
          period: string
          source: string
          stock_units: number | null
          vso_pct: number | null
        }
        Insert: {
          avg_price_m2?: number | null
          created_at?: string
          id?: string
          municipality_id: string
          neighborhood?: string | null
          period: string
          source: string
          stock_units?: number | null
          vso_pct?: number | null
        }
        Update: {
          avg_price_m2?: number | null
          created_at?: string
          id?: string
          municipality_id?: string
          neighborhood?: string | null
          period?: string
          source?: string
          stock_units?: number | null
          vso_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_indicators_municipality_id_fkey"
            columns: ["municipality_id"]
            isOneToOne: false
            referencedRelation: "municipalities"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          is_owner: boolean
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          is_owner?: boolean
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          is_owner?: boolean
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: Json
          conversation_id: string
          created_at: string
          id: string
          input_tokens: number | null
          model: string | null
          output_tokens: number | null
          role: Database["public"]["Enums"]["message_role"]
          tool_calls: Json | null
        }
        Insert: {
          content: Json
          conversation_id: string
          created_at?: string
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          role: Database["public"]["Enums"]["message_role"]
          tool_calls?: Json | null
        }
        Update: {
          content?: Json
          conversation_id?: string
          created_at?: string
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          role?: Database["public"]["Enums"]["message_role"]
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      municipalities: {
        Row: {
          center: unknown
          coverage_status: Database["public"]["Enums"]["coverage_status"]
          created_at: string
          ibge_code: string
          id: string
          name: string
          uf: string
          updated_at: string
        }
        Insert: {
          center?: unknown
          coverage_status?: Database["public"]["Enums"]["coverage_status"]
          created_at?: string
          ibge_code: string
          id?: string
          name: string
          uf: string
          updated_at?: string
        }
        Update: {
          center?: unknown
          coverage_status?: Database["public"]["Enums"]["coverage_status"]
          created_at?: string
          ibge_code?: string
          id?: string
          name?: string
          uf?: string
          updated_at?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["org_kind"]
          name: string
          plan_label: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["org_kind"]
          name: string
          plan_label?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["org_kind"]
          name?: string
          plan_label?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      report_versions: {
        Row: {
          created_at: string
          created_by: string
          engine_version: string
          id: string
          input: Json
          output: Json
          report_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          engine_version: string
          id?: string
          input: Json
          output: Json
          report_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string
          engine_version?: string
          id?: string
          input?: Json
          output?: Json
          report_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_versions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          analysis_run_id: string | null
          created_at: string
          created_by: string
          current_version: number
          id: string
          land_id: string | null
          organization_id: string
          share_token: string | null
          title: string
          updated_at: string
        }
        Insert: {
          analysis_run_id?: string | null
          created_at?: string
          created_by?: string
          current_version?: number
          id?: string
          land_id?: string | null
          organization_id?: string
          share_token?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          analysis_run_id?: string | null
          created_at?: string
          created_by?: string
          current_version?: number
          id?: string
          land_id?: string | null
          organization_id?: string
          share_token?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_analysis_run_id_fkey"
            columns: ["analysis_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_weights: {
        Row: {
          active: boolean
          axis: Database["public"]["Enums"]["risk_axis"]
          description: string | null
          flag_code: string
          label: string
          updated_at: string
          weight: number
        }
        Insert: {
          active?: boolean
          axis: Database["public"]["Enums"]["risk_axis"]
          description?: string | null
          flag_code: string
          label: string
          updated_at?: string
          weight: number
        }
        Update: {
          active?: boolean
          axis?: Database["public"]["Enums"]["risk_axis"]
          description?: string | null
          flag_code?: string
          label?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      rule_sources: {
        Row: {
          article: string
          created_at: string
          excerpt: string | null
          field: string
          id: string
          legal_document_id: string
          zoning_rule_id: string
        }
        Insert: {
          article: string
          created_at?: string
          excerpt?: string | null
          field: string
          id?: string
          legal_document_id: string
          zoning_rule_id: string
        }
        Update: {
          article?: string
          created_at?: string
          excerpt?: string | null
          field?: string
          id?: string
          legal_document_id?: string
          zoning_rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_sources_legal_document_id_fkey"
            columns: ["legal_document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_sources_zoning_rule_id_fkey"
            columns: ["zoning_rule_id"]
            isOneToOne: false
            referencedRelation: "zoning_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          code: string
          created_at: string
          description: string | null
          geojson: Json | null
          geom: unknown
          id: string
          kind: Database["public"]["Enums"]["zone_kind"]
          legal_document_id: string | null
          municipality_id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          geojson?: Json | null
          geom?: unknown
          id?: string
          kind?: Database["public"]["Enums"]["zone_kind"]
          legal_document_id?: string | null
          municipality_id: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          geojson?: Json | null
          geom?: unknown
          id?: string
          kind?: Database["public"]["Enums"]["zone_kind"]
          legal_document_id?: string | null
          municipality_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "zones_legal_document_id_fkey"
            columns: ["legal_document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zones_municipality_id_fkey"
            columns: ["municipality_id"]
            isOneToOne: false
            referencedRelation: "municipalities"
            referencedColumns: ["id"]
          },
        ]
      }
      zoning_rules: {
        Row: {
          ca_basico: number | null
          ca_max: number | null
          ca_min: number | null
          created_at: string
          created_by: string | null
          gabarito_m: number | null
          gabarito_pavimentos: number | null
          id: string
          lote_minimo_m2: number | null
          observacoes: string | null
          outorga_fator: number | null
          outorga_formula: string | null
          permeabilidade_min: number | null
          permitted: boolean
          recuo_frontal: string | null
          recuo_fundos: string | null
          recuo_lateral: string | null
          status: Database["public"]["Enums"]["rule_status"]
          testada_minima_m: number | null
          to_max: number | null
          updated_at: string
          use_label_local: string | null
          use_type: Database["public"]["Enums"]["land_use"]
          validated_at: string | null
          validated_by: string | null
          zone_id: string
        }
        Insert: {
          ca_basico?: number | null
          ca_max?: number | null
          ca_min?: number | null
          created_at?: string
          created_by?: string | null
          gabarito_m?: number | null
          gabarito_pavimentos?: number | null
          id?: string
          lote_minimo_m2?: number | null
          observacoes?: string | null
          outorga_fator?: number | null
          outorga_formula?: string | null
          permeabilidade_min?: number | null
          permitted?: boolean
          recuo_frontal?: string | null
          recuo_fundos?: string | null
          recuo_lateral?: string | null
          status?: Database["public"]["Enums"]["rule_status"]
          testada_minima_m?: number | null
          to_max?: number | null
          updated_at?: string
          use_label_local?: string | null
          use_type: Database["public"]["Enums"]["land_use"]
          validated_at?: string | null
          validated_by?: string | null
          zone_id: string
        }
        Update: {
          ca_basico?: number | null
          ca_max?: number | null
          ca_min?: number | null
          created_at?: string
          created_by?: string | null
          gabarito_m?: number | null
          gabarito_pavimentos?: number | null
          id?: string
          lote_minimo_m2?: number | null
          observacoes?: string | null
          outorga_fator?: number | null
          outorga_formula?: string | null
          permeabilidade_min?: number | null
          permitted?: boolean
          recuo_frontal?: string | null
          recuo_fundos?: string | null
          recuo_lateral?: string | null
          status?: Database["public"]["Enums"]["rule_status"]
          testada_minima_m?: number | null
          to_max?: number | null
          updated_at?: string
          use_label_local?: string | null
          use_type?: Database["public"]["Enums"]["land_use"]
          validated_at?: string | null
          validated_by?: string | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoning_rules_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      environmental_hits: {
        Args: { p_geojson: Json; p_municipality_id: string }
        Returns: {
          is_fictitious: boolean
          kind: Database["public"]["Enums"]["environmental_layer_kind"]
          layer_id: string
          name: string
          overlap_m2: number
          source: string
        }[]
      }
      identify_zones: {
        Args: { p_geojson: Json; p_municipality_id: string }
        Returns: {
          code: string
          name: string
          overlap_m2: number
          overlap_ratio: number
          zone_id: string
        }[]
      }
      latest_cub: {
        Args: { p_standard?: string; p_uf: string }
        Returns: {
          created_at: string
          id: string
          notes: string | null
          reference_month: string
          source: string
          source_url: string | null
          standard: string
          uf: string
          value_m2: number
        }[]
        SetofOptions: {
          from: "*"
          to: "cub_values"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      acquisition_model: "compra" | "permuta"
      app_role: "admin" | "analista" | "membro" | "proprietario"
      comparable_kind: "lancamento" | "oferta" | "venda"
      comparable_typology:
        | "apartamento"
        | "casa"
        | "sala_comercial"
        | "loja"
        | "lote"
        | "outro"
      coverage_request_status:
        | "aberto"
        | "em_andamento"
        | "atendido"
        | "recusado"
      coverage_status: "sem_cobertura" | "em_implantacao" | "coberto"
      environmental_layer_kind:
        | "app"
        | "area_alagavel"
        | "zona_protecao_ambiental"
        | "faixa_nao_edificavel"
        | "faixa_dominio"
        | "tombamento"
        | "outro"
      land_document_kind:
        | "matricula"
        | "escritura"
        | "levantamento_topografico"
        | "certidao"
        | "outro"
      land_shape: "retangular" | "trapezoidal" | "irregular"
      land_status:
        | "disponivel"
        | "em_negociacao"
        | "reservado"
        | "vendido"
        | "indisponivel"
      land_use:
        | "residencial_vertical"
        | "residencial_horizontal"
        | "comercial"
        | "servicos"
        | "misto"
        | "industrial"
        | "institucional"
      legal_document_kind:
        | "lei"
        | "lei_complementar"
        | "decreto"
        | "resolucao"
        | "instrucao_normativa"
        | "outro"
      message_role: "user" | "assistant" | "tool"
      negotiation_type:
        | "dinheiro"
        | "permuta_fisica"
        | "permuta_financeira"
        | "misto"
      org_kind: "incorporadora" | "construtora" | "investidor" | "outro"
      review_verdict: "conferido" | "divergente"
      risk_axis: "urbanistico" | "fisico" | "juridico" | "mercado"
      risk_tolerance: "baixa" | "media" | "alta"
      rule_status: "rascunho" | "validado" | "arquivado"
      topography: "plano" | "aclive" | "declive" | "irregular"
      zone_assignment: "automatica" | "manual"
      zone_kind: "zona" | "macrozona" | "zeis" | "zona_especial" | "outro"
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
      acquisition_model: ["compra", "permuta"],
      app_role: ["admin", "analista", "membro", "proprietario"],
      comparable_kind: ["lancamento", "oferta", "venda"],
      comparable_typology: [
        "apartamento",
        "casa",
        "sala_comercial",
        "loja",
        "lote",
        "outro",
      ],
      coverage_request_status: [
        "aberto",
        "em_andamento",
        "atendido",
        "recusado",
      ],
      coverage_status: ["sem_cobertura", "em_implantacao", "coberto"],
      environmental_layer_kind: [
        "app",
        "area_alagavel",
        "zona_protecao_ambiental",
        "faixa_nao_edificavel",
        "faixa_dominio",
        "tombamento",
        "outro",
      ],
      land_document_kind: [
        "matricula",
        "escritura",
        "levantamento_topografico",
        "certidao",
        "outro",
      ],
      land_shape: ["retangular", "trapezoidal", "irregular"],
      land_status: [
        "disponivel",
        "em_negociacao",
        "reservado",
        "vendido",
        "indisponivel",
      ],
      land_use: [
        "residencial_vertical",
        "residencial_horizontal",
        "comercial",
        "servicos",
        "misto",
        "industrial",
        "institucional",
      ],
      legal_document_kind: [
        "lei",
        "lei_complementar",
        "decreto",
        "resolucao",
        "instrucao_normativa",
        "outro",
      ],
      message_role: ["user", "assistant", "tool"],
      negotiation_type: [
        "dinheiro",
        "permuta_fisica",
        "permuta_financeira",
        "misto",
      ],
      org_kind: ["incorporadora", "construtora", "investidor", "outro"],
      review_verdict: ["conferido", "divergente"],
      risk_axis: ["urbanistico", "fisico", "juridico", "mercado"],
      risk_tolerance: ["baixa", "media", "alta"],
      rule_status: ["rascunho", "validado", "arquivado"],
      topography: ["plano", "aclive", "declive", "irregular"],
      zone_assignment: ["automatica", "manual"],
      zone_kind: ["zona", "macrozona", "zeis", "zona_especial", "outro"],
    },
  },
} as const
