
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "activities": {
                  Row: {
                    "actor_type": Database["public"]['Enums']["actor_type"],"actor_user_id": string | null,"body": string | null,"company_id": string,"contact_id": string | null,"created_at": string,"id": string,"is_demo": boolean,"metadata": NonNullable<Json>,"occurred_at": string,"opportunity_id": string | null,"tenant_id": string,"title": string,"type": Database["public"]['Enums']["activity_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_type"?: Database["public"]['Enums']["actor_type"],"actor_user_id"?: string | null,"body"?: string | null,"company_id": string,"contact_id"?: string | null,"created_at"?: string,"id"?: string,"is_demo"?: boolean,"metadata"?: NonNullable<Json>,"occurred_at"?: string,"opportunity_id"?: string | null,"tenant_id": string,"title": string,"type": Database["public"]['Enums']["activity_type"],"updated_at"?: string
                  }
                  Update: {
                    "actor_type"?: Database["public"]['Enums']["actor_type"],"actor_user_id"?: string | null,"body"?: string | null,"company_id"?: string,"contact_id"?: string | null,"created_at"?: string,"id"?: string,"is_demo"?: boolean,"metadata"?: NonNullable<Json>,"occurred_at"?: string,"opportunity_id"?: string | null,"tenant_id"?: string,"title"?: string,"type"?: Database["public"]['Enums']["activity_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activities_actor_user_id_fkey"
      columns: ["actor_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activities_tenant_id_company_id_fkey"
      columns: ["tenant_id","company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "activities_tenant_id_company_id_fkey"
      columns: ["tenant_id","company_id"]
isOneToOne: false
      referencedRelation: "leads_view"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "activities_tenant_id_contact_id_fkey"
      columns: ["tenant_id","contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "activities_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activities_tenant_id_opportunity_id_fkey"
      columns: ["tenant_id","opportunity_id"]
isOneToOne: false
      referencedRelation: "opportunities"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_type": Database["public"]['Enums']["actor_type"],"actor_user_id": string | null,"created_at": string,"detail": NonNullable<Json>,"entity_id": string | null,"entity_type": string,"id": string,"is_demo": boolean,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_type"?: Database["public"]['Enums']["actor_type"],"actor_user_id"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type": string,"id"?: string,"is_demo"?: boolean,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "action"?: string,"actor_type"?: Database["public"]['Enums']["actor_type"],"actor_user_id"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"is_demo"?: boolean,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_actor_user_id_fkey"
      columns: ["actor_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_logs_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"buying_signals": {
                  Row: {
                    "company_id": string,"confidence": number,"created_at": string,"evidence_summary": string,"expires_at": string,"id": string,"is_demo": boolean,"observed_at": string,"signal_type": Database["public"]['Enums']["signal_type"],"source_id": string | null,"source_type": Database["public"]['Enums']["signal_source_type"],"source_url": string,"tenant_id": string,"updated_at": string,"verification_status": Database["public"]['Enums']["signal_verification"]
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"confidence": number,"created_at"?: string,"evidence_summary": string,"expires_at": string,"id"?: string,"is_demo"?: boolean,"observed_at": string,"signal_type": Database["public"]['Enums']["signal_type"],"source_id"?: string | null,"source_type": Database["public"]['Enums']["signal_source_type"],"source_url": string,"tenant_id": string,"updated_at"?: string,"verification_status"?: Database["public"]['Enums']["signal_verification"]
                  }
                  Update: {
                    "company_id"?: string,"confidence"?: number,"created_at"?: string,"evidence_summary"?: string,"expires_at"?: string,"id"?: string,"is_demo"?: boolean,"observed_at"?: string,"signal_type"?: Database["public"]['Enums']["signal_type"],"source_id"?: string | null,"source_type"?: Database["public"]['Enums']["signal_source_type"],"source_url"?: string,"tenant_id"?: string,"updated_at"?: string,"verification_status"?: Database["public"]['Enums']["signal_verification"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "buying_signals_tenant_id_company_id_fkey"
      columns: ["tenant_id","company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "buying_signals_tenant_id_company_id_fkey"
      columns: ["tenant_id","company_id"]
isOneToOne: false
      referencedRelation: "leads_view"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "buying_signals_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "buying_signals_tenant_id_source_id_fkey"
      columns: ["tenant_id","source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"campaign_contacts": {
                  Row: {
                    "campaign_id": string,"company_id": string,"contact_id": string,"created_at": string,"current_step": number,"enrolled_at": string,"id": string,"is_demo": boolean,"next_send_at": string | null,"status": Database["public"]['Enums']["enrolment_status"],"stop_reason": Database["public"]['Enums']["stop_reason"] | null,"stopped_at": string | null,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"company_id": string,"contact_id": string,"created_at"?: string,"current_step"?: number,"enrolled_at"?: string,"id"?: string,"is_demo"?: boolean,"next_send_at"?: string | null,"status"?: Database["public"]['Enums']["enrolment_status"],"stop_reason"?: Database["public"]['Enums']["stop_reason"] | null,"stopped_at"?: string | null,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "campaign_id"?: string,"company_id"?: string,"contact_id"?: string,"created_at"?: string,"current_step"?: number,"enrolled_at"?: string,"id"?: string,"is_demo"?: boolean,"next_send_at"?: string | null,"status"?: Database["public"]['Enums']["enrolment_status"],"stop_reason"?: Database["public"]['Enums']["stop_reason"] | null,"stopped_at"?: string | null,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "campaign_contacts_tenant_id_campaign_id_fkey"
      columns: ["tenant_id","campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "campaign_contacts_tenant_id_company_id_fkey"
      columns: ["tenant_id","company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "campaign_contacts_tenant_id_company_id_fkey"
      columns: ["tenant_id","company_id"]
isOneToOne: false
      referencedRelation: "leads_view"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "campaign_contacts_tenant_id_contact_id_fkey"
      columns: ["tenant_id","contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "campaign_contacts_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"campaigns": {
                  Row: {
                    "channel": Database["public"]['Enums']["channel"],"country": string,"created_at": string,"daily_limit": number,"description": string | null,"ended_at": string | null,"id": string,"industry_id": string | null,"is_demo": boolean,"mode_override": Database["public"]['Enums']["outreach_mode"] | null,"name": string,"sequence": NonNullable<Json>,"service_id": string | null,"spend_inr": number,"started_at": string | null,"status": Database["public"]['Enums']["campaign_status"],"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "channel"?: Database["public"]['Enums']["channel"],"country"?: string,"created_at"?: string,"daily_limit"?: number,"description"?: string | null,"ended_at"?: string | null,"id"?: string,"industry_id"?: string | null,"is_demo"?: boolean,"mode_override"?: Database["public"]['Enums']["outreach_mode"] | null,"name": string,"sequence"?: NonNullable<Json>,"service_id"?: string | null,"spend_inr"?: number,"started_at"?: string | null,"status"?: Database["public"]['Enums']["campaign_status"],"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "channel"?: Database["public"]['Enums']["channel"],"country"?: string,"created_at"?: string,"daily_limit"?: number,"description"?: string | null,"ended_at"?: string | null,"id"?: string,"industry_id"?: string | null,"is_demo"?: boolean,"mode_override"?: Database["public"]['Enums']["outreach_mode"] | null,"name"?: string,"sequence"?: NonNullable<Json>,"service_id"?: string | null,"spend_inr"?: number,"started_at"?: string | null,"status"?: Database["public"]['Enums']["campaign_status"],"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "campaigns_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "campaigns_tenant_id_industry_id_fkey"
      columns: ["tenant_id","industry_id"]
isOneToOne: false
      referencedRelation: "industries"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "campaigns_tenant_id_service_id_fkey"
      columns: ["tenant_id","service_id"]
isOneToOne: false
      referencedRelation: "service_catalogue"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"channel_policies": {
                  Row: {
                    "automation_allowed": boolean,"channel": Database["public"]['Enums']["channel"],"country": string,"created_at": string,"daily_limit": number,"id": string,"notes": string | null,"outbound_allowed": boolean,"requires_consent": boolean,"requires_inbound_initiation": boolean,"reviewed_at": string | null,"reviewed_by": string | null,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "automation_allowed"?: boolean,"channel": Database["public"]['Enums']["channel"],"country": string,"created_at"?: string,"daily_limit"?: number,"id"?: string,"notes"?: string | null,"outbound_allowed"?: boolean,"requires_consent"?: boolean,"requires_inbound_initiation"?: boolean,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "automation_allowed"?: boolean,"channel"?: Database["public"]['Enums']["channel"],"country"?: string,"created_at"?: string,"daily_limit"?: number,"id"?: string,"notes"?: string | null,"outbound_allowed"?: boolean,"requires_consent"?: boolean,"requires_inbound_initiation"?: boolean,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "channel_policies_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "channel_policies_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"companies": {
                  Row: {
                    "acquisition_channel": Database["public"]['Enums']["acquisition_channel"],"branch_count": number | null,"city": string | null,"country": string,"created_at": string,"customer_at": string | null,"description": string | null,"discovered_at": string,"domain": string | null,"employee_count_estimate": number | null,"employee_range": Database["public"]['Enums']["employee_range"] | null,"first_contacted_at": string | null,"first_meeting_at": string | null,"first_positive_reply_at": string | null,"id": string,"industry_id": string | null,"is_demo": boolean,"is_qualified": boolean,"last_researched_at": string | null,"lead_stage": Database["public"]['Enums']["lead_stage"],"name": string,"normalised_domain": string | null,"normalised_name": string | null,"opportunity_score": number | null,"owner_user_id": string | null,"priority": Database["public"]['Enums']["lead_priority"] | null,"qualified_at": string | null,"researched_at": string | null,"source_id": string | null,"state": string | null,"tags": (string)[],"tenant_id": string,"updated_at": string,"verified_at": string | null,"website_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acquisition_channel"?: Database["public"]['Enums']["acquisition_channel"],"branch_count"?: number | null,"city"?: string | null,"country"?: string,"created_at"?: string,"customer_at"?: string | null,"description"?: string | null,"discovered_at"?: string,"domain"?: string | null,"employee_count_estimate"?: number | null,"employee_range"?: Database["public"]['Enums']["employee_range"] | null,"first_contacted_at"?: string | null,"first_meeting_at"?: string | null,"first_positive_reply_at"?: string | null,"id"?: string,"industry_id"?: string | null,"is_demo"?: boolean,"is_qualified"?: boolean,"last_researched_at"?: string | null,"lead_stage"?: Database["public"]['Enums']["lead_stage"],"name": string,"normalised_domain"?: never,"normalised_name"?: never,"opportunity_score"?: number | null,"owner_user_id"?: string | null,"priority"?: Database["public"]['Enums']["lead_priority"] | null,"qualified_at"?: string | null,"researched_at"?: string | null,"source_id"?: string | null,"state"?: string | null,"tags"?: (string)[],"tenant_id": string,"updated_at"?: string,"verified_at"?: string | null,"website_url"?: string | null
                  }
                  Update: {
                    "acquisition_channel"?: Database["public"]['Enums']["acquisition_channel"],"branch_count"?: number | null,"city"?: string | null,"country"?: string,"created_at"?: string,"customer_at"?: string | null,"description"?: string | null,"discovered_at"?: string,"domain"?: string | null,"employee_count_estimate"?: number | null,"employee_range"?: Database["public"]['Enums']["employee_range"] | null,"first_contacted_at"?: string | null,"first_meeting_at"?: string | null,"first_positive_reply_at"?: string | null,"id"?: string,"industry_id"?: string | null,"is_demo"?: boolean,"is_qualified"?: boolean,"last_researched_at"?: string | null,"lead_stage"?: Database["public"]['Enums']["lead_stage"],"name"?: string,"normalised_domain"?: never,"normalised_name"?: never,"opportunity_score"?: number | null,"owner_user_id"?: string | null,"priority"?: Database["public"]['Enums']["lead_priority"] | null,"qualified_at"?: string | null,"researched_at"?: string | null,"source_id"?: string | null,"state"?: string | null,"tags"?: (string)[],"tenant_id"?: string,"updated_at"?: string,"verified_at"?: string | null,"website_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "companies_owner_user_id_fkey"
      columns: ["owner_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "companies_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "companies_tenant_id_industry_id_fkey"
      columns: ["tenant_id","industry_id"]
isOneToOne: false
      referencedRelation: "industries"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "companies_tenant_id_source_id_fkey"
      columns: ["tenant_id","source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"consent_records": {
                  Row: {
                    "basis": Database["public"]['Enums']["consent_basis"],"channel": Database["public"]['Enums']["channel"],"contact_id": string,"created_at": string,"evidence": string | null,"id": string,"is_demo": boolean,"recorded_at": string,"recorded_by": string | null,"source_id": string | null,"status": Database["public"]['Enums']["consent_status"],"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "basis": Database["public"]['Enums']["consent_basis"],"channel": Database["public"]['Enums']["channel"],"contact_id": string,"created_at"?: string,"evidence"?: string | null,"id"?: string,"is_demo"?: boolean,"recorded_at"?: string,"recorded_by"?: string | null,"source_id"?: string | null,"status": Database["public"]['Enums']["consent_status"],"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "basis"?: Database["public"]['Enums']["consent_basis"],"channel"?: Database["public"]['Enums']["channel"],"contact_id"?: string,"created_at"?: string,"evidence"?: string | null,"id"?: string,"is_demo"?: boolean,"recorded_at"?: string,"recorded_by"?: string | null,"source_id"?: string | null,"status"?: Database["public"]['Enums']["consent_status"],"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "consent_records_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consent_records_tenant_id_contact_id_fkey"
      columns: ["tenant_id","contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "consent_records_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consent_records_tenant_id_source_id_fkey"
      columns: ["tenant_id","source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"contact_verifications": {
                  Row: {
                    "checked_at": string,"contact_id": string,"created_at": string,"detail": NonNullable<Json>,"id": string,"is_demo": boolean,"provider": string,"result": Database["public"]['Enums']["verification_status"],"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "checked_at"?: string,"contact_id": string,"created_at"?: string,"detail"?: NonNullable<Json>,"id"?: string,"is_demo"?: boolean,"provider": string,"result": Database["public"]['Enums']["verification_status"],"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "checked_at"?: string,"contact_id"?: string,"created_at"?: string,"detail"?: NonNullable<Json>,"id"?: string,"is_demo"?: boolean,"provider"?: string,"result"?: Database["public"]['Enums']["verification_status"],"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contact_verifications_tenant_id_contact_id_fkey"
      columns: ["tenant_id","contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "contact_verifications_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"contacts": {
                  Row: {
                    "company_id": string,"created_at": string,"do_not_contact": boolean,"email": string | null,"email_normalised": string | null,"full_name": string,"id": string,"is_demo": boolean,"is_primary": boolean,"job_title": string | null,"last_verified_at": string | null,"linkedin_url": string | null,"phone": string | null,"provenance_note": string | null,"reliability_score": number | null,"role_category": Database["public"]['Enums']["contact_role"],"source_id": string | null,"tenant_id": string,"updated_at": string,"verification_provider": string | null,"verification_status": Database["public"]['Enums']["verification_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"do_not_contact"?: boolean,"email"?: string | null,"email_normalised"?: never,"full_name": string,"id"?: string,"is_demo"?: boolean,"is_primary"?: boolean,"job_title"?: string | null,"last_verified_at"?: string | null,"linkedin_url"?: string | null,"phone"?: string | null,"provenance_note"?: string | null,"reliability_score"?: number | null,"role_category"?: Database["public"]['Enums']["contact_role"],"source_id"?: string | null,"tenant_id": string,"updated_at"?: string,"verification_provider"?: string | null,"verification_status"?: Database["public"]['Enums']["verification_status"]
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"do_not_contact"?: boolean,"email"?: string | null,"email_normalised"?: never,"full_name"?: string,"id"?: string,"is_demo"?: boolean,"is_primary"?: boolean,"job_title"?: string | null,"last_verified_at"?: string | null,"linkedin_url"?: string | null,"phone"?: string | null,"provenance_note"?: string | null,"reliability_score"?: number | null,"role_category"?: Database["public"]['Enums']["contact_role"],"source_id"?: string | null,"tenant_id"?: string,"updated_at"?: string,"verification_provider"?: string | null,"verification_status"?: Database["public"]['Enums']["verification_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "contacts_tenant_id_company_id_fkey"
      columns: ["tenant_id","company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "contacts_tenant_id_company_id_fkey"
      columns: ["tenant_id","company_id"]
isOneToOne: false
      referencedRelation: "leads_view"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "contacts_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contacts_tenant_id_source_id_fkey"
      columns: ["tenant_id","source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"conversations": {
                  Row: {
                    "assigned_user_id": string | null,"campaign_id": string | null,"channel": Database["public"]['Enums']["channel"],"company_id": string,"contact_id": string,"created_at": string,"human_takeover": boolean,"id": string,"is_demo": boolean,"last_intent": Database["public"]['Enums']["reply_intent"] | null,"last_message_at": string | null,"status": Database["public"]['Enums']["conversation_status"],"subject": string | null,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_user_id"?: string | null,"campaign_id"?: string | null,"channel"?: Database["public"]['Enums']["channel"],"company_id": string,"contact_id": string,"created_at"?: string,"human_takeover"?: boolean,"id"?: string,"is_demo"?: boolean,"last_intent"?: Database["public"]['Enums']["reply_intent"] | null,"last_message_at"?: string | null,"status"?: Database["public"]['Enums']["conversation_status"],"subject"?: string | null,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "assigned_user_id"?: string | null,"campaign_id"?: string | null,"channel"?: Database["public"]['Enums']["channel"],"company_id"?: string,"contact_id"?: string,"created_at"?: string,"human_takeover"?: boolean,"id"?: string,"is_demo"?: boolean,"last_intent"?: Database["public"]['Enums']["reply_intent"] | null,"last_message_at"?: string | null,"status"?: Database["public"]['Enums']["conversation_status"],"subject"?: string | null,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversations_assigned_user_id_fkey"
      columns: ["assigned_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_tenant_id_campaign_id_fkey"
      columns: ["tenant_id","campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "conversations_tenant_id_company_id_fkey"
      columns: ["tenant_id","company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "conversations_tenant_id_company_id_fkey"
      columns: ["tenant_id","company_id"]
isOneToOne: false
      referencedRelation: "leads_view"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "conversations_tenant_id_contact_id_fkey"
      columns: ["tenant_id","contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "conversations_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"industries": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"name": string,"origin": Database["public"]['Enums']["industry_origin"],"slug": string,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"origin"?: Database["public"]['Enums']["industry_origin"],"slug": string,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"origin"?: Database["public"]['Enums']["industry_origin"],"slug"?: string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "industries_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"industry_experiments": {
                  Row: {
                    "assumed_ability_to_pay": number,"assumed_deal_size": number,"assumed_decision_maker_access": number,"assumed_delivery_profitability": number,"assumed_problem_evidence": number,"assumed_recurring_potential": number,"created_at": string,"ended_at": string | null,"hypothesis": string | null,"id": string,"industry_id": string,"is_demo": boolean,"name": string,"notes": string | null,"spend_inr": number,"started_at": string | null,"status": Database["public"]['Enums']["experiment_status"],"target_companies": number,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assumed_ability_to_pay"?: number,"assumed_deal_size"?: number,"assumed_decision_maker_access"?: number,"assumed_delivery_profitability"?: number,"assumed_problem_evidence"?: number,"assumed_recurring_potential"?: number,"created_at"?: string,"ended_at"?: string | null,"hypothesis"?: string | null,"id"?: string,"industry_id": string,"is_demo"?: boolean,"name": string,"notes"?: string | null,"spend_inr"?: number,"started_at"?: string | null,"status"?: Database["public"]['Enums']["experiment_status"],"target_companies"?: number,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "assumed_ability_to_pay"?: number,"assumed_deal_size"?: number,"assumed_decision_maker_access"?: number,"assumed_delivery_profitability"?: number,"assumed_problem_evidence"?: number,"assumed_recurring_potential"?: number,"created_at"?: string,"ended_at"?: string | null,"hypothesis"?: string | null,"id"?: string,"industry_id"?: string,"is_demo"?: boolean,"name"?: string,"notes"?: string | null,"spend_inr"?: number,"started_at"?: string | null,"status"?: Database["public"]['Enums']["experiment_status"],"target_companies"?: number,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "industry_experiments_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "industry_experiments_tenant_id_industry_id_fkey"
      columns: ["tenant_id","industry_id"]
isOneToOne: false
      referencedRelation: "industries"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"lead_score_snapshots": {
                  Row: {
                    "commercial_potential": number,"company_id": string,"computed_at": string,"contact_id": string | null,"contact_reliability": number | null,"created_at": string,"decision_maker_access": number,"delivery_fit": number,"disqualification_reasons": (string)[],"engine_version": string,"explanations": NonNullable<Json>,"icp_fit": number,"id": string,"inputs": NonNullable<Json>,"is_demo": boolean,"is_qualified": boolean,"priority": Database["public"]['Enums']["lead_priority"],"problem_evidence": number,"tenant_id": string,"timing_signal": number,"total_score": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "commercial_potential": number,"company_id": string,"computed_at"?: string,"contact_id"?: string | null,"contact_reliability"?: number | null,"created_at"?: string,"decision_maker_access": number,"delivery_fit": number,"disqualification_reasons"?: (string)[],"engine_version": string,"explanations"?: NonNullable<Json>,"icp_fit": number,"id"?: string,"inputs"?: NonNullable<Json>,"is_demo"?: boolean,"is_qualified": boolean,"priority": Database["public"]['Enums']["lead_priority"],"problem_evidence": number,"tenant_id": string,"timing_signal": number,"total_score": number,"updated_at"?: string
                  }
                  Update: {
                    "commercial_potential"?: number,"company_id"?: string,"computed_at"?: string,"contact_id"?: string | null,"contact_reliability"?: number | null,"created_at"?: string,"decision_maker_access"?: number,"delivery_fit"?: number,"disqualification_reasons"?: (string)[],"engine_version"?: string,"explanations"?: NonNullable<Json>,"icp_fit"?: number,"id"?: string,"inputs"?: NonNullable<Json>,"is_demo"?: boolean,"is_qualified"?: boolean,"priority"?: Database["public"]['Enums']["lead_priority"],"problem_evidence"?: number,"tenant_id"?: string,"timing_signal"?: number,"total_score"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lead_score_snapshots_tenant_id_company_id_fkey"
      columns: ["tenant_id","company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "lead_score_snapshots_tenant_id_company_id_fkey"
      columns: ["tenant_id","company_id"]
isOneToOne: false
      referencedRelation: "leads_view"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "lead_score_snapshots_tenant_id_contact_id_fkey"
      columns: ["tenant_id","contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "lead_score_snapshots_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"meetings": {
                  Row: {
                    "attended_at": string | null,"booked_at": string | null,"company_id": string,"contact_id": string,"conversation_id": string | null,"created_at": string,"ends_at": string,"host_timezone": string,"id": string,"is_demo": boolean,"meeting_url": string | null,"opportunity_id": string | null,"outcome_notes": string | null,"owner_user_id": string | null,"prospect_timezone": string,"provider": string | null,"provider_event_id": string | null,"slot_selected_by_prospect": boolean,"starts_at": string,"status": Database["public"]['Enums']["meeting_status"],"tenant_id": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attended_at"?: string | null,"booked_at"?: string | null,"company_id": string,"contact_id": string,"conversation_id"?: string | null,"created_at"?: string,"ends_at": string,"host_timezone"?: string,"id"?: string,"is_demo"?: boolean,"meeting_url"?: string | null,"opportunity_id"?: string | null,"outcome_notes"?: string | null,"owner_user_id"?: string | null,"prospect_timezone"?: string,"provider"?: string | null,"provider_event_id"?: string | null,"slot_selected_by_prospect"?: boolean,"starts_at": string,"status"?: Database["public"]['Enums']["meeting_status"],"tenant_id": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "attended_at"?: string | null,"booked_at"?: string | null,"company_id"?: string,"contact_id"?: string,"conversation_id"?: string | null,"created_at"?: string,"ends_at"?: string,"host_timezone"?: string,"id"?: string,"is_demo"?: boolean,"meeting_url"?: string | null,"opportunity_id"?: string | null,"outcome_notes"?: string | null,"owner_user_id"?: string | null,"prospect_timezone"?: string,"provider"?: string | null,"provider_event_id"?: string | null,"slot_selected_by_prospect"?: boolean,"starts_at"?: string,"status"?: Database["public"]['Enums']["meeting_status"],"tenant_id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meetings_owner_user_id_fkey"
      columns: ["owner_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meetings_tenant_id_company_id_fkey"
      columns: ["tenant_id","company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "meetings_tenant_id_company_id_fkey"
      columns: ["tenant_id","company_id"]
isOneToOne: false
      referencedRelation: "leads_view"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "meetings_tenant_id_contact_id_fkey"
      columns: ["tenant_id","contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "meetings_tenant_id_conversation_id_fkey"
      columns: ["tenant_id","conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "meetings_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meetings_tenant_id_opportunity_id_fkey"
      columns: ["tenant_id","opportunity_id"]
isOneToOne: false
      referencedRelation: "opportunities"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "created_at": string,"id": string,"role": Database["public"]['Enums']["member_role"],"tenant_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"role"?: Database["public"]['Enums']["member_role"],"tenant_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"role"?: Database["public"]['Enums']["member_role"],"tenant_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"body": string,"campaign_contact_id": string | null,"channel": Database["public"]['Enums']["channel"],"company_id": string,"contact_id": string,"conversation_id": string,"created_at": string,"direction": Database["public"]['Enums']["message_direction"],"gate_result": Json | null,"id": string,"idempotency_key": string,"intent": Database["public"]['Enums']["reply_intent"] | null,"intent_confidence": number | null,"is_demo": boolean,"model": string | null,"origin": Database["public"]['Enums']["content_origin"],"processing_history": NonNullable<Json>,"provider": string | null,"provider_message_id": string | null,"received_at": string | null,"scheduled_for": string | null,"sent_at": string | null,"sequence_step": number | null,"status": Database["public"]['Enums']["message_status"],"subject": string | null,"supporting_fact_ids": (string)[],"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"body": string,"campaign_contact_id"?: string | null,"channel"?: Database["public"]['Enums']["channel"],"company_id": string,"contact_id": string,"conversation_id": string,"created_at"?: string,"direction": Database["public"]['Enums']["message_direction"],"gate_result"?: Json | null,"id"?: string,"idempotency_key": string,"intent"?: Database["public"]['Enums']["reply_intent"] | null,"intent_confidence"?: number | null,"is_demo"?: boolean,"model"?: string | null,"origin"?: Database["public"]['Enums']["content_origin"],"processing_history"?: NonNullable<Json>,"provider"?: string | null,"provider_message_id"?: string | null,"received_at"?: string | null,"scheduled_for"?: string | null,"sent_at"?: string | null,"sequence_step"?: number | null,"status": Database["public"]['Enums']["message_status"],"subject"?: string | null,"supporting_fact_ids"?: (string)[],"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"body"?: string,"campaign_contact_id"?: string | null,"channel"?: Database["public"]['Enums']["channel"],"company_id"?: string,"contact_id"?: string,"conversation_id"?: string,"created_at"?: string,"direction"?: Database["public"]['Enums']["message_direction"],"gate_result"?: Json | null,"id"?: string,"idempotency_key"?: string,"intent"?: Database["public"]['Enums']["reply_intent"] | null,"intent_confidence"?: number | null,"is_demo"?: boolean,"model"?: string | null,"origin"?: Database["public"]['Enums']["content_origin"],"processing_history"?: NonNullable<Json>,"provider"?: string | null,"provider_message_id"?: string | null,"received_at"?: string | null,"scheduled_for"?: string | null,"sent_at"?: string | null,"sequence_step"?: number | null,"status"?: Database["public"]['Enums']["message_status"],"subject"?: string | null,"supporting_fact_ids"?: (string)[],"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_tenant_id_campaign_contact_id_fkey"
      columns: ["tenant_id","campaign_contact_id"]
isOneToOne: false
      referencedRelation: "campaign_contacts"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "messages_tenant_id_company_id_fkey"
      columns: ["tenant_id","company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "messages_tenant_id_company_id_fkey"
      columns: ["tenant_id","company_id"]
isOneToOne: false
      referencedRelation: "leads_view"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "messages_tenant_id_contact_id_fkey"
      columns: ["tenant_id","contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "messages_tenant_id_conversation_id_fkey"
      columns: ["tenant_id","conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "messages_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"opportunities": {
                  Row: {
                    "acquisition_channel": Database["public"]['Enums']["acquisition_channel"],"collected_revenue_inr": number,"company_id": string,"created_at": string,"delivery_cost_inr": number,"estimated_value_inr": number | null,"expected_close_date": string | null,"id": string,"is_demo": boolean,"lost_at": string | null,"lost_reason": string | null,"observed_facts": (string)[],"origin": Database["public"]['Enums']["content_origin"],"outreach_angle": string | null,"owner_user_id": string | null,"possible_impact": string | null,"primary_contact_id": string | null,"problem_hypothesis": string | null,"proposal_sent_at": string | null,"recommended_solution": string | null,"relevance_rationale": string | null,"service_id": string | null,"stage": Database["public"]['Enums']["opportunity_stage"],"tenant_id": string,"title": string,"updated_at": string,"validation_questions": (string)[],"won_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acquisition_channel"?: Database["public"]['Enums']["acquisition_channel"],"collected_revenue_inr"?: number,"company_id": string,"created_at"?: string,"delivery_cost_inr"?: number,"estimated_value_inr"?: number | null,"expected_close_date"?: string | null,"id"?: string,"is_demo"?: boolean,"lost_at"?: string | null,"lost_reason"?: string | null,"observed_facts"?: (string)[],"origin"?: Database["public"]['Enums']["content_origin"],"outreach_angle"?: string | null,"owner_user_id"?: string | null,"possible_impact"?: string | null,"primary_contact_id"?: string | null,"problem_hypothesis"?: string | null,"proposal_sent_at"?: string | null,"recommended_solution"?: string | null,"relevance_rationale"?: string | null,"service_id"?: string | null,"stage"?: Database["public"]['Enums']["opportunity_stage"],"tenant_id": string,"title": string,"updated_at"?: string,"validation_questions"?: (string)[],"won_at"?: string | null
                  }
                  Update: {
                    "acquisition_channel"?: Database["public"]['Enums']["acquisition_channel"],"collected_revenue_inr"?: number,"company_id"?: string,"created_at"?: string,"delivery_cost_inr"?: number,"estimated_value_inr"?: number | null,"expected_close_date"?: string | null,"id"?: string,"is_demo"?: boolean,"lost_at"?: string | null,"lost_reason"?: string | null,"observed_facts"?: (string)[],"origin"?: Database["public"]['Enums']["content_origin"],"outreach_angle"?: string | null,"owner_user_id"?: string | null,"possible_impact"?: string | null,"primary_contact_id"?: string | null,"problem_hypothesis"?: string | null,"proposal_sent_at"?: string | null,"recommended_solution"?: string | null,"relevance_rationale"?: string | null,"service_id"?: string | null,"stage"?: Database["public"]['Enums']["opportunity_stage"],"tenant_id"?: string,"title"?: string,"updated_at"?: string,"validation_questions"?: (string)[],"won_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "opportunities_owner_user_id_fkey"
      columns: ["owner_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "opportunities_tenant_id_company_id_fkey"
      columns: ["tenant_id","company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "opportunities_tenant_id_company_id_fkey"
      columns: ["tenant_id","company_id"]
isOneToOne: false
      referencedRelation: "leads_view"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "opportunities_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "opportunities_tenant_id_primary_contact_id_fkey"
      columns: ["tenant_id","primary_contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "opportunities_tenant_id_service_id_fkey"
      columns: ["tenant_id","service_id"]
isOneToOne: false
      referencedRelation: "service_catalogue"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"provider_settings": {
                  Row: {
                    "category": Database["public"]['Enums']["provider_category"],"config": NonNullable<Json>,"created_at": string,"id": string,"is_enabled": boolean,"provider": string,"secret_env_var": string | null,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": Database["public"]['Enums']["provider_category"],"config"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"is_enabled"?: boolean,"provider"?: string,"secret_env_var"?: string | null,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "category"?: Database["public"]['Enums']["provider_category"],"config"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"is_enabled"?: boolean,"provider"?: string,"secret_env_var"?: string | null,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "provider_settings_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"research_records": {
                  Row: {
                    "company_id": string,"confidence": number | null,"created_at": string,"evidence_quote": string | null,"evidence_url": string | null,"id": string,"is_demo": boolean,"kind": Database["public"]['Enums']["research_kind"],"model": string | null,"origin": Database["public"]['Enums']["content_origin"],"page_type": Database["public"]['Enums']["page_type"] | null,"researched_at": string,"source_id": string | null,"statement": string,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"confidence"?: number | null,"created_at"?: string,"evidence_quote"?: string | null,"evidence_url"?: string | null,"id"?: string,"is_demo"?: boolean,"kind": Database["public"]['Enums']["research_kind"],"model"?: string | null,"origin"?: Database["public"]['Enums']["content_origin"],"page_type"?: Database["public"]['Enums']["page_type"] | null,"researched_at"?: string,"source_id"?: string | null,"statement": string,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"confidence"?: number | null,"created_at"?: string,"evidence_quote"?: string | null,"evidence_url"?: string | null,"id"?: string,"is_demo"?: boolean,"kind"?: Database["public"]['Enums']["research_kind"],"model"?: string | null,"origin"?: Database["public"]['Enums']["content_origin"],"page_type"?: Database["public"]['Enums']["page_type"] | null,"researched_at"?: string,"source_id"?: string | null,"statement"?: string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "research_records_tenant_id_company_id_fkey"
      columns: ["tenant_id","company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "research_records_tenant_id_company_id_fkey"
      columns: ["tenant_id","company_id"]
isOneToOne: false
      referencedRelation: "leads_view"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "research_records_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "research_records_tenant_id_source_id_fkey"
      columns: ["tenant_id","source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"saved_filters": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"params": NonNullable<Json>,"scope": string,"tenant_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"params"?: NonNullable<Json>,"scope"?: string,"tenant_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"params"?: NonNullable<Json>,"scope"?: string,"tenant_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_filters_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saved_filters_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"service_catalogue": {
                  Row: {
                    "created_at": string,"deliverables": (string)[],"delivery_weeks_max": number | null,"delivery_weeks_min": number | null,"description": string,"est_implementation_cost_inr": number | null,"id": string,"ideal_customer_profile": string,"is_active": boolean,"name": string,"needs_review": boolean,"price_max_inr": number | null,"price_min_inr": number | null,"problems_solved": (string)[],"recurring_support_options": (string)[],"slug": string,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deliverables"?: (string)[],"delivery_weeks_max"?: number | null,"delivery_weeks_min"?: number | null,"description"?: string,"est_implementation_cost_inr"?: number | null,"id"?: string,"ideal_customer_profile"?: string,"is_active"?: boolean,"name": string,"needs_review"?: boolean,"price_max_inr"?: number | null,"price_min_inr"?: number | null,"problems_solved"?: (string)[],"recurring_support_options"?: (string)[],"slug": string,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"deliverables"?: (string)[],"delivery_weeks_max"?: number | null,"delivery_weeks_min"?: number | null,"description"?: string,"est_implementation_cost_inr"?: number | null,"id"?: string,"ideal_customer_profile"?: string,"is_active"?: boolean,"name"?: string,"needs_review"?: boolean,"price_max_inr"?: number | null,"price_min_inr"?: number | null,"problems_solved"?: (string)[],"recurring_support_options"?: (string)[],"slug"?: string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_catalogue_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"sources": {
                  Row: {
                    "created_at": string,"id": string,"is_demo": boolean,"kind": Database["public"]['Enums']["source_kind"],"label": string,"licence_note": string | null,"metadata": NonNullable<Json>,"provider": string | null,"query": string | null,"retrieved_at": string,"tenant_id": string,"updated_at": string,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_demo"?: boolean,"kind": Database["public"]['Enums']["source_kind"],"label": string,"licence_note"?: string | null,"metadata"?: NonNullable<Json>,"provider"?: string | null,"query"?: string | null,"retrieved_at"?: string,"tenant_id": string,"updated_at"?: string,"url"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_demo"?: boolean,"kind"?: Database["public"]['Enums']["source_kind"],"label"?: string,"licence_note"?: string | null,"metadata"?: NonNullable<Json>,"provider"?: string | null,"query"?: string | null,"retrieved_at"?: string,"tenant_id"?: string,"updated_at"?: string,"url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sources_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"suppressions": {
                  Row: {
                    "address": string,"address_type": Database["public"]['Enums']["address_type"],"channel": Database["public"]['Enums']["channel"] | null,"contact_id": string | null,"created_at": string,"created_by": string | null,"id": string,"is_demo": boolean,"note": string | null,"reason": Database["public"]['Enums']["suppression_reason"],"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address": string,"address_type"?: Database["public"]['Enums']["address_type"],"channel"?: Database["public"]['Enums']["channel"] | null,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_demo"?: boolean,"note"?: string | null,"reason": Database["public"]['Enums']["suppression_reason"],"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string,"address_type"?: Database["public"]['Enums']["address_type"],"channel"?: Database["public"]['Enums']["channel"] | null,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_demo"?: boolean,"note"?: string | null,"reason"?: Database["public"]['Enums']["suppression_reason"],"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "suppressions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "suppressions_tenant_id_contact_id_fkey"
      columns: ["tenant_id","contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "suppressions_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"users": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"email": string,"full_name": string | null,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"email": string,"full_name"?: string | null,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"email"?: string,"full_name"?: string | null,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"workflow_executions": {
                  Row: {
                    "attempt": number,"created_at": string,"duration_ms": number | null,"error_detail": Json | null,"error_message": string | null,"finished_at": string | null,"id": string,"idempotency_key": string | null,"input": NonNullable<Json>,"is_demo": boolean,"items_processed": number,"job_id": string,"mode": Database["public"]['Enums']["workflow_mode"],"output": NonNullable<Json>,"queued_at": string,"retry_of": string | null,"started_at": string | null,"status": Database["public"]['Enums']["execution_status"],"tenant_id": string,"trigger": Database["public"]['Enums']["execution_trigger"],"updated_at": string,"workflow_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt"?: number,"created_at"?: string,"duration_ms"?: number | null,"error_detail"?: Json | null,"error_message"?: string | null,"finished_at"?: string | null,"id"?: string,"idempotency_key"?: string | null,"input"?: NonNullable<Json>,"is_demo"?: boolean,"items_processed"?: number,"job_id": string,"mode"?: Database["public"]['Enums']["workflow_mode"],"output"?: NonNullable<Json>,"queued_at"?: string,"retry_of"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["execution_status"],"tenant_id": string,"trigger"?: Database["public"]['Enums']["execution_trigger"],"updated_at"?: string,"workflow_key": string
                  }
                  Update: {
                    "attempt"?: number,"created_at"?: string,"duration_ms"?: number | null,"error_detail"?: Json | null,"error_message"?: string | null,"finished_at"?: string | null,"id"?: string,"idempotency_key"?: string | null,"input"?: NonNullable<Json>,"is_demo"?: boolean,"items_processed"?: number,"job_id"?: string,"mode"?: Database["public"]['Enums']["workflow_mode"],"output"?: NonNullable<Json>,"queued_at"?: string,"retry_of"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["execution_status"],"tenant_id"?: string,"trigger"?: Database["public"]['Enums']["execution_trigger"],"updated_at"?: string,"workflow_key"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workflow_executions_retry_of_fkey"
      columns: ["retry_of"]
isOneToOne: false
      referencedRelation: "workflow_executions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workflow_executions_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workflow_executions_tenant_id_job_id_fkey"
      columns: ["tenant_id","job_id"]
isOneToOne: false
      referencedRelation: "workflow_jobs"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"workflow_jobs": {
                  Row: {
                    "config": NonNullable<Json>,"created_at": string,"description": string | null,"id": string,"last_run_at": string | null,"last_status": Database["public"]['Enums']["execution_status"] | null,"mode": Database["public"]['Enums']["workflow_mode"],"name": string,"next_run_at": string | null,"schedule_cron": string | null,"status": Database["public"]['Enums']["workflow_job_status"],"tenant_id": string,"updated_at": string,"workflow_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "config"?: NonNullable<Json>,"created_at"?: string,"description"?: string | null,"id"?: string,"last_run_at"?: string | null,"last_status"?: Database["public"]['Enums']["execution_status"] | null,"mode"?: Database["public"]['Enums']["workflow_mode"],"name": string,"next_run_at"?: string | null,"schedule_cron"?: string | null,"status"?: Database["public"]['Enums']["workflow_job_status"],"tenant_id": string,"updated_at"?: string,"workflow_key": string
                  }
                  Update: {
                    "config"?: NonNullable<Json>,"created_at"?: string,"description"?: string | null,"id"?: string,"last_run_at"?: string | null,"last_status"?: Database["public"]['Enums']["execution_status"] | null,"mode"?: Database["public"]['Enums']["workflow_mode"],"name"?: string,"next_run_at"?: string | null,"schedule_cron"?: string | null,"status"?: Database["public"]['Enums']["workflow_job_status"],"tenant_id"?: string,"updated_at"?: string,"workflow_key"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workflow_jobs_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspaces": {
                  Row: {
                    "country": string,"created_at": string,"currency": string,"daily_qualified_target": number,"daily_send_limit": number,"data_retention_days": number,"has_demo_data": boolean,"id": string,"name": string,"outbound_kill_switch": boolean,"outreach_mode": Database["public"]['Enums']["outreach_mode"],"slug": string,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "country"?: string,"created_at"?: string,"currency"?: string,"daily_qualified_target"?: number,"daily_send_limit"?: number,"data_retention_days"?: number,"has_demo_data"?: boolean,"id"?: string,"name": string,"outbound_kill_switch"?: boolean,"outreach_mode"?: Database["public"]['Enums']["outreach_mode"],"slug": string,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "country"?: string,"created_at"?: string,"currency"?: string,"daily_qualified_target"?: number,"daily_send_limit"?: number,"data_retention_days"?: number,"has_demo_data"?: boolean,"id"?: string,"name"?: string,"outbound_kill_switch"?: boolean,"outreach_mode"?: Database["public"]['Enums']["outreach_mode"],"slug"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "leads_view": {
                  Row: {
                    "acquisition_channel": Database["public"]['Enums']["acquisition_channel"],"active_signal_count": number | null,"active_signal_types": (Database["public"]['Enums']["signal_type"])[] | null,"city": string | null,"company_name": string,"contact_email": string | null,"contact_id": string | null,"contact_job_title": string | null,"contact_name": string | null,"contact_reliability": number | null,"contact_verification_status": Database["public"]['Enums']["verification_status"] | null,"country": string,"created_at": string,"discovered_at": string,"domain": string | null,"employee_count_estimate": number | null,"employee_range": Database["public"]['Enums']["employee_range"] | null,"id": string,"industry_id": string | null,"industry_name": string | null,"is_demo": boolean,"is_qualified": boolean,"last_researched_at": string | null,"lead_stage": Database["public"]['Enums']["lead_stage"],"opportunity_score": number | null,"possible_duplicate": boolean | null,"priority": Database["public"]['Enums']["lead_priority"] | null,"qualified_at": string | null,"recommended_service_id": string | null,"recommended_service_name": string | null,"source_kind": Database["public"]['Enums']["source_kind"] | null,"source_label": string | null,"state": string | null,"tags": (string)[],"tenant_id": string,"top_signal_observed_at": string | null,"top_signal_summary": string | null,"top_signal_type": Database["public"]['Enums']["signal_type"] | null,"updated_at": string,"website_url": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "companies_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "companies_tenant_id_industry_id_fkey"
      columns: ["tenant_id","industry_id"]
isOneToOne: false
      referencedRelation: "industries"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                }
          }
          Functions: {
            "channel_performance":
{ Args: { "p_from": string,"p_tenant": string,"p_to": string }; Returns: {
              "channel": Database["public"]['Enums']["acquisition_channel"],"gross_profit_inr": number,"leads": number,"meetings": number,"positive_replies": number,"qualified": number,"revenue_inr": number,"won": number
            }[]
                           },
"dashboard_funnel":
{ Args: { "p_from": string,"p_tenant": string,"p_to": string }; Returns: {
              "companies": number,"ordinal": number,"stage": string
            }[]
                           },
"dashboard_kpis":
{ Args: { "p_from": string,"p_tenant": string,"p_to": string }; Returns: Json
                           },
"industry_performance":
{ Args: { "p_from": string,"p_tenant": string,"p_to": string }; Returns: {
              "acquisition_cost_inr": number,"contacted": number,"discovered": number,"gross_profit_inr": number,"industry_id": string,"industry_name": string,"meetings": number,"positive_replies": number,"positive_reply_rate": number,"proposals": number,"qualified": number,"replied": number,"revenue_inr": number,"won": number
            }[]
                           },
"is_positive_intent":
{ Args: { "i": Database["public"]['Enums']["reply_intent"] }; Returns: boolean
                           },
"lead_generation_series":
{ Args: { "p_bucket"?: string,"p_from": string,"p_tenant": string,"p_to": string }; Returns: {
              "bucket_start": string,"discovered": number,"qualified": number
            }[]
                           },
"pipeline_by_stage":
{ Args: { "p_from": string,"p_tenant": string,"p_to": string }; Returns: {
              "opportunities": number,"stage": Database["public"]['Enums']["opportunity_stage"],"value_inr": number
            }[]
                           },
"workflow_stats":
{ Args: { "p_from": string,"p_tenant": string,"p_to": string }; Returns: {
              "avg_duration_ms": number,"cancelled": number,"failed": number,"queued": number,"running": number,"succeeded": number,"workflow_key": string,"workflow_name": string
            }[]
                           }
          }
          Enums: {
            "acquisition_channel": "email_outreach"|"referral"|"inbound"|"partnership"|"event"|"other","activity_type": "note"|"stage_change"|"research"|"score"|"email_sent"|"email_received"|"meeting"|"call"|"task"|"tag"|"system","actor_type": "user"|"ai"|"system"|"workflow","address_type": "email"|"phone"|"domain","campaign_status": "draft"|"active"|"paused"|"completed"|"archived","channel": "email"|"linkedin"|"whatsapp"|"telegram"|"voice"|"referral"|"inbound","consent_basis": "explicit_opt_in"|"inbound_enquiry"|"existing_relationship"|"callback_request"|"b2b_first_contact","consent_status": "granted"|"withdrawn","contact_role": "owner_founder"|"director_cxo"|"operations"|"sales_marketing"|"it"|"finance"|"other","content_origin": "human"|"ai"|"provider"|"system"|"demo_seed","conversation_status": "open"|"awaiting_reply"|"needs_review"|"closed","employee_range": "1-9"|"10-49"|"50-99"|"100-200"|"201-500"|"500+","enrolment_status": "pending"|"active"|"completed"|"stopped","execution_status": "queued"|"running"|"succeeded"|"failed"|"cancelled","execution_trigger": "schedule"|"manual"|"webhook"|"retry","experiment_status": "planned"|"running"|"paused"|"completed","industry_origin": "catalogue"|"discovered","lead_priority": "A"|"B"|"C","lead_stage": "discovered"|"researched"|"verified"|"qualified"|"contacted"|"positive_reply"|"meeting"|"proposal"|"customer"|"nurture"|"rejected","meeting_status": "proposed"|"booked"|"rescheduled"|"cancelled"|"attended"|"no_show","member_role": "owner"|"admin"|"member"|"viewer","message_direction": "outbound"|"inbound","message_status": "draft"|"pending_approval"|"approved"|"scheduled"|"sent"|"delivered"|"bounced"|"failed"|"rejected"|"cancelled"|"received","opportunity_stage": "identified"|"qualified"|"meeting_scheduled"|"proposal_sent"|"negotiation"|"won"|"lost","outreach_mode": "draft_only"|"human_approval"|"controlled_autonomy","page_type": "about"|"services"|"products"|"contact"|"careers"|"locations"|"announcements"|"other","provider_category": "llm"|"search"|"discovery"|"website_research"|"enrichment"|"email_verification"|"email_delivery"|"calendar"|"n8n","reply_intent": "interested"|"wants_meeting"|"wants_pricing"|"requests_information"|"objection"|"not_interested"|"unsubscribe"|"out_of_office"|"complaint"|"human_review","research_kind": "summary"|"observed_fact"|"ai_hypothesis","signal_source_type": "careers_page"|"company_website"|"news"|"job_board"|"directory"|"manual"|"demo_seed","signal_type": "hiring_operations"|"hiring_support"|"new_branch"|"distribution_expansion"|"product_launch"|"ecommerce_expansion"|"service_locations"|"new_process"|"other","signal_verification": "unverified"|"verified"|"rejected","source_kind": "search_provider"|"website"|"directory"|"referral"|"inbound_form"|"manual"|"import"|"event"|"partner"|"demo_seed","stop_reason": "replied"|"unsubscribed"|"opted_out"|"hard_bounce"|"complaint"|"manual"|"suppressed","suppression_reason": "unsubscribe"|"opt_out"|"hard_bounce"|"complaint"|"manual"|"do_not_contact","verification_status": "unverified"|"valid"|"risky"|"catch_all"|"invalid"|"unknown","workflow_job_status": "active"|"paused","workflow_mode": "n8n"|"local_simulation"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "acquisition_channel": ["email_outreach", "referral", "inbound", "partnership", "event", "other"],"activity_type": ["note", "stage_change", "research", "score", "email_sent", "email_received", "meeting", "call", "task", "tag", "system"],"actor_type": ["user", "ai", "system", "workflow"],"address_type": ["email", "phone", "domain"],"campaign_status": ["draft", "active", "paused", "completed", "archived"],"channel": ["email", "linkedin", "whatsapp", "telegram", "voice", "referral", "inbound"],"consent_basis": ["explicit_opt_in", "inbound_enquiry", "existing_relationship", "callback_request", "b2b_first_contact"],"consent_status": ["granted", "withdrawn"],"contact_role": ["owner_founder", "director_cxo", "operations", "sales_marketing", "it", "finance", "other"],"content_origin": ["human", "ai", "provider", "system", "demo_seed"],"conversation_status": ["open", "awaiting_reply", "needs_review", "closed"],"employee_range": ["1-9", "10-49", "50-99", "100-200", "201-500", "500+"],"enrolment_status": ["pending", "active", "completed", "stopped"],"execution_status": ["queued", "running", "succeeded", "failed", "cancelled"],"execution_trigger": ["schedule", "manual", "webhook", "retry"],"experiment_status": ["planned", "running", "paused", "completed"],"industry_origin": ["catalogue", "discovered"],"lead_priority": ["A", "B", "C"],"lead_stage": ["discovered", "researched", "verified", "qualified", "contacted", "positive_reply", "meeting", "proposal", "customer", "nurture", "rejected"],"meeting_status": ["proposed", "booked", "rescheduled", "cancelled", "attended", "no_show"],"member_role": ["owner", "admin", "member", "viewer"],"message_direction": ["outbound", "inbound"],"message_status": ["draft", "pending_approval", "approved", "scheduled", "sent", "delivered", "bounced", "failed", "rejected", "cancelled", "received"],"opportunity_stage": ["identified", "qualified", "meeting_scheduled", "proposal_sent", "negotiation", "won", "lost"],"outreach_mode": ["draft_only", "human_approval", "controlled_autonomy"],"page_type": ["about", "services", "products", "contact", "careers", "locations", "announcements", "other"],"provider_category": ["llm", "search", "discovery", "website_research", "enrichment", "email_verification", "email_delivery", "calendar", "n8n"],"reply_intent": ["interested", "wants_meeting", "wants_pricing", "requests_information", "objection", "not_interested", "unsubscribe", "out_of_office", "complaint", "human_review"],"research_kind": ["summary", "observed_fact", "ai_hypothesis"],"signal_source_type": ["careers_page", "company_website", "news", "job_board", "directory", "manual", "demo_seed"],"signal_type": ["hiring_operations", "hiring_support", "new_branch", "distribution_expansion", "product_launch", "ecommerce_expansion", "service_locations", "new_process", "other"],"signal_verification": ["unverified", "verified", "rejected"],"source_kind": ["search_provider", "website", "directory", "referral", "inbound_form", "manual", "import", "event", "partner", "demo_seed"],"stop_reason": ["replied", "unsubscribed", "opted_out", "hard_bounce", "complaint", "manual", "suppressed"],"suppression_reason": ["unsubscribe", "opt_out", "hard_bounce", "complaint", "manual", "do_not_contact"],"verification_status": ["unverified", "valid", "risky", "catch_all", "invalid", "unknown"],"workflow_job_status": ["active", "paused"],"workflow_mode": ["n8n", "local_simulation"]
          }
        }
} as const
