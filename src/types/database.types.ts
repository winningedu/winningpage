// 자동 생성 — 손으로 고치지 말 것. 재생성: npm run gen:types
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      admin_access_logs: {
        Row: {
          action: string;
          actor_email: string;
          created_at: string;
          id: string;
          profile_id: string | null;
          reason: string;
          resource_key: string;
          row_count: number | null;
          target_id: string | null;
        };
        Insert: {
          action: string;
          actor_email: string;
          created_at?: string;
          id?: string;
          profile_id?: string | null;
          reason: string;
          resource_key: string;
          row_count?: number | null;
          target_id?: string | null;
        };
        Update: {
          action?: string;
          actor_email?: string;
          created_at?: string;
          id?: string;
          profile_id?: string | null;
          reason?: string;
          resource_key?: string;
          row_count?: number | null;
          target_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_access_logs_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_member_permissions: {
        Row: {
          created_at: string;
          granted_by: string | null;
          level: string;
          profile_id: string;
          resource_key: string;
        };
        Insert: {
          created_at?: string;
          granted_by?: string | null;
          level: string;
          profile_id: string;
          resource_key: string;
        };
        Update: {
          created_at?: string;
          granted_by?: string | null;
          level?: string;
          profile_id?: string;
          resource_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_member_permissions_granted_by_fkey";
            columns: ["granted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_member_permissions_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "admin_member_directory";
            referencedColumns: ["profile_id"];
          },
          {
            foreignKeyName: "admin_member_permissions_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "admin_members";
            referencedColumns: ["profile_id"];
          },
          {
            foreignKeyName: "admin_member_permissions_resource_key_fkey";
            columns: ["resource_key"];
            isOneToOne: false;
            referencedRelation: "admin_resources";
            referencedColumns: ["key"];
          },
        ];
      };
      admin_members: {
        Row: {
          activated_at: string | null;
          created_at: string;
          department: string | null;
          invited_at: string;
          invited_by: string | null;
          profile_id: string;
          role_id: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          activated_at?: string | null;
          created_at?: string;
          department?: string | null;
          invited_at?: string;
          invited_by?: string | null;
          profile_id: string;
          role_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          activated_at?: string | null;
          created_at?: string;
          department?: string | null;
          invited_at?: string;
          invited_by?: string | null;
          profile_id?: string;
          role_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_members_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_members_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_members_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "admin_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_resources: {
        Row: {
          created_at: string;
          group_title: string;
          is_active: boolean;
          key: string;
          label: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          group_title: string;
          is_active?: boolean;
          key: string;
          label: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          group_title?: string;
          is_active?: boolean;
          key?: string;
          label?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      admin_role_permissions: {
        Row: {
          level: string;
          resource_key: string;
          role_id: string;
        };
        Insert: {
          level: string;
          resource_key: string;
          role_id: string;
        };
        Update: {
          level?: string;
          resource_key?: string;
          role_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_role_permissions_resource_key_fkey";
            columns: ["resource_key"];
            isOneToOne: false;
            referencedRelation: "admin_resources";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "admin_role_permissions_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "admin_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_roles: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_super: boolean;
          is_system: boolean;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_super?: boolean;
          is_system?: boolean;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_super?: boolean;
          is_system?: boolean;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      admission_acceptance_rates: {
        Row: {
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          rate: number;
          sort_order: number | null;
          updated_at: string | null;
          year: number;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          rate?: number;
          sort_order?: number | null;
          updated_at?: string | null;
          year: number;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          rate?: number;
          sort_order?: number | null;
          updated_at?: string | null;
          year?: number;
        };
        Relationships: [];
      };
      admission_case_logos: {
        Row: {
          created_at: string | null;
          display_height_rem: number | null;
          id: string;
          is_active: boolean | null;
          logo_url: string;
          name: string;
          opacity: number | null;
          row_no: number;
          sort_order: number | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          display_height_rem?: number | null;
          id?: string;
          is_active?: boolean | null;
          logo_url?: string;
          name: string;
          opacity?: number | null;
          row_no?: number;
          sort_order?: number | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          display_height_rem?: number | null;
          id?: string;
          is_active?: boolean | null;
          logo_url?: string;
          name?: string;
          opacity?: number | null;
          row_no?: number;
          sort_order?: number | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      admission_jungsi_results: {
        Row: {
          apply_group: string | null;
          created_at: string | null;
          department_key: string | null;
          department_name: string;
          department_short_name: string | null;
          expected_percentile: number | null;
          expected_score: number | null;
          id: number;
          past_70_1911: number | null;
          past_70_2011: number | null;
          past_70_2111: number | null;
          past_70_2211: number | null;
          past_70_2311: number | null;
          past_70_2411: number | null;
          past_accept_1911: number | null;
          past_accept_2011: number | null;
          past_accept_2111: number | null;
          past_accept_2211: number | null;
          past_accept_2311: number | null;
          past_accept_2411: number | null;
          proper_percentile: number | null;
          proper_score: number | null;
          quota: number | null;
          reach_percentile: number | null;
          reach_score: number | null;
          region_city: string | null;
          region_district: string | null;
          source_sheet: string | null;
          track: string | null;
          university_key: string | null;
          university_name: string;
          university_short_name: string | null;
        };
        Insert: {
          apply_group?: string | null;
          created_at?: string | null;
          department_key?: string | null;
          department_name: string;
          department_short_name?: string | null;
          expected_percentile?: number | null;
          expected_score?: number | null;
          id?: number;
          past_70_1911?: number | null;
          past_70_2011?: number | null;
          past_70_2111?: number | null;
          past_70_2211?: number | null;
          past_70_2311?: number | null;
          past_70_2411?: number | null;
          past_accept_1911?: number | null;
          past_accept_2011?: number | null;
          past_accept_2111?: number | null;
          past_accept_2211?: number | null;
          past_accept_2311?: number | null;
          past_accept_2411?: number | null;
          proper_percentile?: number | null;
          proper_score?: number | null;
          quota?: number | null;
          reach_percentile?: number | null;
          reach_score?: number | null;
          region_city?: string | null;
          region_district?: string | null;
          source_sheet?: string | null;
          track?: string | null;
          university_key?: string | null;
          university_name: string;
          university_short_name?: string | null;
        };
        Update: {
          apply_group?: string | null;
          created_at?: string | null;
          department_key?: string | null;
          department_name?: string;
          department_short_name?: string | null;
          expected_percentile?: number | null;
          expected_score?: number | null;
          id?: number;
          past_70_1911?: number | null;
          past_70_2011?: number | null;
          past_70_2111?: number | null;
          past_70_2211?: number | null;
          past_70_2311?: number | null;
          past_70_2411?: number | null;
          past_accept_1911?: number | null;
          past_accept_2011?: number | null;
          past_accept_2111?: number | null;
          past_accept_2211?: number | null;
          past_accept_2311?: number | null;
          past_accept_2411?: number | null;
          proper_percentile?: number | null;
          proper_score?: number | null;
          quota?: number | null;
          reach_percentile?: number | null;
          reach_score?: number | null;
          region_city?: string | null;
          region_district?: string | null;
          source_sheet?: string | null;
          track?: string | null;
          university_key?: string | null;
          university_name?: string;
          university_short_name?: string | null;
        };
        Relationships: [];
      };
      admission_posts: {
        Row: {
          attachments: Json;
          category: string;
          content: string | null;
          content_json: Json | null;
          created_at: string;
          file_name: string | null;
          file_url: string | null;
          id: number;
          image_url: string | null;
          image_urls: Json;
          is_active: boolean;
          is_pinned: boolean;
          show_on_home: boolean;
          sort_order: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          attachments?: Json;
          category: string;
          content?: string | null;
          content_json?: Json | null;
          created_at?: string;
          file_name?: string | null;
          file_url?: string | null;
          id?: number;
          image_url?: string | null;
          image_urls?: Json;
          is_active?: boolean;
          is_pinned?: boolean;
          show_on_home?: boolean;
          sort_order?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          attachments?: Json;
          category?: string;
          content?: string | null;
          content_json?: Json | null;
          created_at?: string;
          file_name?: string | null;
          file_url?: string | null;
          id?: number;
          image_url?: string | null;
          image_urls?: Json;
          is_active?: boolean;
          is_pinned?: boolean;
          show_on_home?: boolean;
          sort_order?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      admission_results: {
        Row: {
          admission_track: string;
          competition_rate: number | null;
          converted_score: number | null;
          created_at: string;
          department_key: string;
          department_name: string;
          grade_50: number | null;
          grade_70: number | null;
          grade_85: number | null;
          grade_90: number | null;
          grade_avg: number | null;
          grade_avg10: number | null;
          grade_first_avg: number | null;
          grade_min: number | null;
          grade_min10: number | null;
          id: number;
          is_active: boolean;
          main_track: string | null;
          note: string | null;
          percentile: number | null;
          quota: number | null;
          result_year: number;
          screening_category: string | null;
          source_row: number | null;
          source_sheet: string | null;
          subject_reflection: string | null;
          university_key: string;
          university_name: string;
          updated_at: string;
          variant_seq: number;
          waitlist_rank: string | null;
        };
        Insert: {
          admission_track: string;
          competition_rate?: number | null;
          converted_score?: number | null;
          created_at?: string;
          department_key: string;
          department_name: string;
          grade_50?: number | null;
          grade_70?: number | null;
          grade_85?: number | null;
          grade_90?: number | null;
          grade_avg?: number | null;
          grade_avg10?: number | null;
          grade_first_avg?: number | null;
          grade_min?: number | null;
          grade_min10?: number | null;
          id?: number;
          is_active?: boolean;
          main_track?: string | null;
          note?: string | null;
          percentile?: number | null;
          quota?: number | null;
          result_year: number;
          screening_category?: string | null;
          source_row?: number | null;
          source_sheet?: string | null;
          subject_reflection?: string | null;
          university_key: string;
          university_name: string;
          updated_at?: string;
          variant_seq?: number;
          waitlist_rank?: string | null;
        };
        Update: {
          admission_track?: string;
          competition_rate?: number | null;
          converted_score?: number | null;
          created_at?: string;
          department_key?: string;
          department_name?: string;
          grade_50?: number | null;
          grade_70?: number | null;
          grade_85?: number | null;
          grade_90?: number | null;
          grade_avg?: number | null;
          grade_avg10?: number | null;
          grade_first_avg?: number | null;
          grade_min?: number | null;
          grade_min10?: number | null;
          id?: number;
          is_active?: boolean;
          main_track?: string | null;
          note?: string | null;
          percentile?: number | null;
          quota?: number | null;
          result_year?: number;
          screening_category?: string | null;
          source_row?: number | null;
          source_sheet?: string | null;
          subject_reflection?: string | null;
          university_key?: string;
          university_name?: string;
          updated_at?: string;
          variant_seq?: number;
          waitlist_rank?: string | null;
        };
        Relationships: [];
      };
      admission_susi_results: {
        Row: {
          admission_type: string | null;
          competition_rate: number | null;
          converted_50: number | null;
          converted_70: number | null;
          converted_total: number | null;
          created_at: string | null;
          department_key: string | null;
          department_name: string;
          grade_50: number | null;
          grade_70: number | null;
          grade_85: number | null;
          grade_90: number | null;
          id: number;
          main_track: string | null;
          quota: number | null;
          source_sheet: string | null;
          subject_reflection: string | null;
          university_key: string | null;
          university_name: string;
          waitlist_rank: string | null;
          year: number;
        };
        Insert: {
          admission_type?: string | null;
          competition_rate?: number | null;
          converted_50?: number | null;
          converted_70?: number | null;
          converted_total?: number | null;
          created_at?: string | null;
          department_key?: string | null;
          department_name: string;
          grade_50?: number | null;
          grade_70?: number | null;
          grade_85?: number | null;
          grade_90?: number | null;
          id?: number;
          main_track?: string | null;
          quota?: number | null;
          source_sheet?: string | null;
          subject_reflection?: string | null;
          university_key?: string | null;
          university_name: string;
          waitlist_rank?: string | null;
          year: number;
        };
        Update: {
          admission_type?: string | null;
          competition_rate?: number | null;
          converted_50?: number | null;
          converted_70?: number | null;
          converted_total?: number | null;
          created_at?: string | null;
          department_key?: string | null;
          department_name?: string;
          grade_50?: number | null;
          grade_70?: number | null;
          grade_85?: number | null;
          grade_90?: number | null;
          id?: number;
          main_track?: string | null;
          quota?: number | null;
          source_sheet?: string | null;
          subject_reflection?: string | null;
          university_key?: string | null;
          university_name?: string;
          waitlist_rank?: string | null;
          year?: number;
        };
        Relationships: [];
      };
      admission_universities: {
        Row: {
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          name: string;
          region: string;
          sort_order: number | null;
          special_group: string | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          name: string;
          region: string;
          sort_order?: number | null;
          special_group?: string | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          region?: string;
          sort_order?: number | null;
          special_group?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      admission_university_resources: {
        Row: {
          admission_year: number;
          campus: string | null;
          created_at: string;
          detail_status: string | null;
          exam_schedule: string | null;
          exam_schedule_html: string | null;
          exam_schedule_json: Json | null;
          id: string;
          is_active: boolean;
          jungsi_guideline_url: string | null;
          matched_hwp_name: string | null;
          matched_text_name: string | null;
          memo: string | null;
          minimum_requirements: string | null;
          minimum_requirements_html: string | null;
          minimum_requirements_json: Json | null;
          official_source_url: string | null;
          previous_year_changes: string | null;
          previous_year_changes_html: string | null;
          previous_year_changes_json: Json | null;
          recruitment_quota: string | null;
          recruitment_quota_json: Json | null;
          recruitment_result_html: string | null;
          region: string;
          school_record_method: string | null;
          school_record_method_html: string | null;
          school_record_method_json: Json | null;
          selection_method: string | null;
          selection_method_html: string | null;
          selection_method_json: Json | null;
          source_name: string;
          source_version: string;
          university_key: string;
          university_name: string;
          updated_at: string;
        };
        Insert: {
          admission_year?: number;
          campus?: string | null;
          created_at?: string;
          detail_status?: string | null;
          exam_schedule?: string | null;
          exam_schedule_html?: string | null;
          exam_schedule_json?: Json | null;
          id?: string;
          is_active?: boolean;
          jungsi_guideline_url?: string | null;
          matched_hwp_name?: string | null;
          matched_text_name?: string | null;
          memo?: string | null;
          minimum_requirements?: string | null;
          minimum_requirements_html?: string | null;
          minimum_requirements_json?: Json | null;
          official_source_url?: string | null;
          previous_year_changes?: string | null;
          previous_year_changes_html?: string | null;
          previous_year_changes_json?: Json | null;
          recruitment_quota?: string | null;
          recruitment_quota_json?: Json | null;
          recruitment_result_html?: string | null;
          region: string;
          school_record_method?: string | null;
          school_record_method_html?: string | null;
          school_record_method_json?: Json | null;
          selection_method?: string | null;
          selection_method_html?: string | null;
          selection_method_json?: Json | null;
          source_name?: string;
          source_version?: string;
          university_key: string;
          university_name: string;
          updated_at?: string;
        };
        Update: {
          admission_year?: number;
          campus?: string | null;
          created_at?: string;
          detail_status?: string | null;
          exam_schedule?: string | null;
          exam_schedule_html?: string | null;
          exam_schedule_json?: Json | null;
          id?: string;
          is_active?: boolean;
          jungsi_guideline_url?: string | null;
          matched_hwp_name?: string | null;
          matched_text_name?: string | null;
          memo?: string | null;
          minimum_requirements?: string | null;
          minimum_requirements_html?: string | null;
          minimum_requirements_json?: Json | null;
          official_source_url?: string | null;
          previous_year_changes?: string | null;
          previous_year_changes_html?: string | null;
          previous_year_changes_json?: Json | null;
          recruitment_quota?: string | null;
          recruitment_quota_json?: Json | null;
          recruitment_result_html?: string | null;
          region?: string;
          school_record_method?: string | null;
          school_record_method_html?: string | null;
          school_record_method_json?: Json | null;
          selection_method?: string | null;
          selection_method_html?: string | null;
          selection_method_json?: Json | null;
          source_name?: string;
          source_version?: string;
          university_key?: string;
          university_name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      alimtalk_send_logs: {
        Row: {
          channel: string;
          dedupe_key: string | null;
          id: number;
          message: string;
          meta: Json;
          phone: string;
          profile_id: string | null;
          provider_code: string | null;
          provider_message: string | null;
          provider_msg_id: string | null;
          sent_at: string;
          status: string;
          subject: string | null;
          template_key: string;
        };
        Insert: {
          channel: string;
          dedupe_key?: string | null;
          id?: never;
          message: string;
          meta?: Json;
          phone: string;
          profile_id?: string | null;
          provider_code?: string | null;
          provider_message?: string | null;
          provider_msg_id?: string | null;
          sent_at?: string;
          status: string;
          subject?: string | null;
          template_key: string;
        };
        Update: {
          channel?: string;
          dedupe_key?: string | null;
          id?: never;
          message?: string;
          meta?: Json;
          phone?: string;
          profile_id?: string | null;
          provider_code?: string | null;
          provider_message?: string | null;
          provider_msg_id?: string | null;
          sent_at?: string;
          status?: string;
          subject?: string | null;
          template_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "alimtalk_send_logs_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      app_settings: {
        Row: {
          key: string;
          updated_at: string;
          value: Json;
        };
        Insert: {
          key: string;
          updated_at?: string;
          value: Json;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: Json;
        };
        Relationships: [];
      };
      banners: {
        Row: {
          button_link: string | null;
          button_text: string | null;
          created_at: string | null;
          display_seconds: number;
          highlight: string | null;
          id: number;
          image_url: string | null;
          is_active: boolean | null;
          sort_order: number | null;
          subtitle: string | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          button_link?: string | null;
          button_text?: string | null;
          created_at?: string | null;
          display_seconds?: number;
          highlight?: string | null;
          id?: number;
          image_url?: string | null;
          is_active?: boolean | null;
          sort_order?: number | null;
          subtitle?: string | null;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          button_link?: string | null;
          button_text?: string | null;
          created_at?: string | null;
          display_seconds?: number;
          highlight?: string | null;
          id?: number;
          image_url?: string | null;
          is_active?: boolean | null;
          sort_order?: number | null;
          subtitle?: string | null;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      board_views: {
        Row: {
          created_at: string;
          post_id: string;
          source: string;
          viewed_on: string;
          viewer_key: string;
        };
        Insert: {
          created_at?: string;
          post_id: string;
          source: string;
          viewed_on: string;
          viewer_key: string;
        };
        Update: {
          created_at?: string;
          post_id?: string;
          source?: string;
          viewed_on?: string;
          viewer_key?: string;
        };
        Relationships: [];
      };
      bundle_items: {
        Row: {
          created_at: string;
          duration_months: number | null;
          list_price: number;
          product_id: string;
          program_key: string;
          session_quota: number | null;
          validity_days: number | null;
        };
        Insert: {
          created_at?: string;
          duration_months?: number | null;
          list_price: number;
          product_id: string;
          program_key: string;
          session_quota?: number | null;
          validity_days?: number | null;
        };
        Update: {
          created_at?: string;
          duration_months?: number | null;
          list_price?: number;
          product_id?: string;
          program_key?: string;
          session_quota?: number | null;
          validity_days?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "bundle_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bundle_items_program_key_fkey";
            columns: ["program_key"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["program_key"];
          },
        ];
      };
      company_news: {
        Row: {
          attachments: Json;
          category: string | null;
          content: string | null;
          created_at: string;
          file_name: string | null;
          file_url: string | null;
          id: string;
          image_url: string | null;
          image_urls: Json;
          is_active: boolean;
          is_pinned: boolean;
          sort_order: number;
          title: string;
          updated_at: string;
          view_count: number;
        };
        Insert: {
          attachments?: Json;
          category?: string | null;
          content?: string | null;
          created_at?: string;
          file_name?: string | null;
          file_url?: string | null;
          id?: string;
          image_url?: string | null;
          image_urls?: Json;
          is_active?: boolean;
          is_pinned?: boolean;
          sort_order?: number;
          title: string;
          updated_at?: string;
          view_count?: number;
        };
        Update: {
          attachments?: Json;
          category?: string | null;
          content?: string | null;
          created_at?: string;
          file_name?: string | null;
          file_url?: string | null;
          id?: string;
          image_url?: string | null;
          image_urls?: Json;
          is_active?: boolean;
          is_pinned?: boolean;
          sort_order?: number;
          title?: string;
          updated_at?: string;
          view_count?: number;
        };
        Relationships: [];
      };
      coupon_grants: {
        Row: {
          coupon_id: string;
          granted_at: string;
          granted_by: string;
          id: number;
          revoke_reason: string | null;
          revoked_at: string | null;
          user_id: string;
          valid_until: string | null;
        };
        Insert: {
          coupon_id: string;
          granted_at?: string;
          granted_by: string;
          id?: never;
          revoke_reason?: string | null;
          revoked_at?: string | null;
          user_id: string;
          valid_until?: string | null;
        };
        Update: {
          coupon_id?: string;
          granted_at?: string;
          granted_by?: string;
          id?: never;
          revoke_reason?: string | null;
          revoked_at?: string | null;
          user_id?: string;
          valid_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "coupon_grants_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "coupon_wallet_state";
            referencedColumns: ["coupon_id"];
          },
          {
            foreignKeyName: "coupon_grants_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "coupons";
            referencedColumns: ["id"];
          },
        ];
      };
      coupon_redemptions: {
        Row: {
          coupon_id: string;
          created_at: string;
          discount_amount: number;
          id: number;
          order_id: string;
          user_id: string | null;
          void_reason: string | null;
          voided_at: string | null;
        };
        Insert: {
          coupon_id: string;
          created_at?: string;
          discount_amount: number;
          id?: never;
          order_id: string;
          user_id?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
        };
        Update: {
          coupon_id?: string;
          created_at?: string;
          discount_amount?: number;
          id?: never;
          order_id?: string;
          user_id?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "coupon_wallet_state";
            referencedColumns: ["coupon_id"];
          },
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "coupons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      coupons: {
        Row: {
          code: string | null;
          created_at: string;
          discount_amount: number;
          grant_on_signup: boolean;
          grant_type: string;
          id: string;
          is_active: boolean;
          max_redemptions: number | null;
          max_uses_per_user: number | null;
          min_amount: number;
          org_code: string | null;
          slug: string;
          stackable: boolean;
          tenant_id: string | null;
          title: string;
          valid_until: string | null;
        };
        Insert: {
          code?: string | null;
          created_at?: string;
          discount_amount: number;
          grant_on_signup?: boolean;
          grant_type?: string;
          id?: string;
          is_active?: boolean;
          max_redemptions?: number | null;
          max_uses_per_user?: number | null;
          min_amount?: number;
          org_code?: string | null;
          slug: string;
          stackable?: boolean;
          tenant_id?: string | null;
          title: string;
          valid_until?: string | null;
        };
        Update: {
          code?: string | null;
          created_at?: string;
          discount_amount?: number;
          grant_on_signup?: boolean;
          grant_type?: string;
          id?: string;
          is_active?: boolean;
          max_redemptions?: number | null;
          max_uses_per_user?: number | null;
          min_amount?: number;
          org_code?: string | null;
          slug?: string;
          stackable?: boolean;
          tenant_id?: string | null;
          title?: string;
          valid_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "coupons_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_entries: {
        Row: {
          class_name: string | null;
          created_at: string | null;
          entry_date: string | null;
          id: string;
          memo: string | null;
          name: string;
          phone: string | null;
          program_name: string | null;
          updated_at: string | null;
        };
        Insert: {
          class_name?: string | null;
          created_at?: string | null;
          entry_date?: string | null;
          id?: string;
          memo?: string | null;
          name?: string;
          phone?: string | null;
          program_name?: string | null;
          updated_at?: string | null;
        };
        Update: {
          class_name?: string | null;
          created_at?: string | null;
          entry_date?: string | null;
          id?: string;
          memo?: string | null;
          name?: string;
          phone?: string | null;
          program_name?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      daily_settlements: {
        Row: {
          created_at: string | null;
          id: string;
          memo: string | null;
          settlement_date: string | null;
          total_discount_amount: number | null;
          total_paid_amount: number | null;
          total_refund_amount: number | null;
          total_sale_amount: number | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          memo?: string | null;
          settlement_date?: string | null;
          total_discount_amount?: number | null;
          total_paid_amount?: number | null;
          total_refund_amount?: number | null;
          total_sale_amount?: number | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          memo?: string | null;
          settlement_date?: string | null;
          total_discount_amount?: number | null;
          total_paid_amount?: number | null;
          total_refund_amount?: number | null;
          total_sale_amount?: number | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      diagnosis_attempts: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          ledger_id: string | null;
          profile_id: string;
          reason: string | null;
        };
        Insert: {
          created_at?: string;
          id: string;
          kind: string;
          ledger_id?: string | null;
          profile_id: string;
          reason?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          ledger_id?: string | null;
          profile_id?: string;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "diagnosis_attempts_ledger_id_fkey";
            columns: ["ledger_id"];
            isOneToOne: false;
            referencedRelation: "performance_credit_ledger";
            referencedColumns: ["id"];
          },
        ];
      };
      diagnosis_reports: {
        Row: {
          attempt_id: string;
          created_at: string;
          diagnosed_at: string;
          payload: Json;
          profile_id: string;
          schema_version: string;
          snapshot: Json;
        };
        Insert: {
          attempt_id: string;
          created_at?: string;
          diagnosed_at: string;
          payload: Json;
          profile_id: string;
          schema_version: string;
          snapshot: Json;
        };
        Update: {
          attempt_id?: string;
          created_at?: string;
          diagnosed_at?: string;
          payload?: Json;
          profile_id?: string;
          schema_version?: string;
          snapshot?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "diagnosis_reports_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: true;
            referencedRelation: "diagnosis_attempts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "diagnosis_reports_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      enrollments: {
        Row: {
          application_status: string | null;
          category_name: string | null;
          class_name: string | null;
          created_at: string | null;
          discount_amount: number | null;
          grade: string | null;
          guardian_name: string | null;
          id: string;
          memo: string | null;
          order_id: string | null;
          paid_amount: number | null;
          payment_status: string | null;
          phone: string | null;
          price: number | null;
          profile_id: string | null;
          program_name: string | null;
          school_name: string | null;
          student_name: string | null;
          term_name: string | null;
          updated_at: string | null;
        };
        Insert: {
          application_status?: string | null;
          category_name?: string | null;
          class_name?: string | null;
          created_at?: string | null;
          discount_amount?: number | null;
          grade?: string | null;
          guardian_name?: string | null;
          id?: string;
          memo?: string | null;
          order_id?: string | null;
          paid_amount?: number | null;
          payment_status?: string | null;
          phone?: string | null;
          price?: number | null;
          profile_id?: string | null;
          program_name?: string | null;
          school_name?: string | null;
          student_name?: string | null;
          term_name?: string | null;
          updated_at?: string | null;
        };
        Update: {
          application_status?: string | null;
          category_name?: string | null;
          class_name?: string | null;
          created_at?: string | null;
          discount_amount?: number | null;
          grade?: string | null;
          guardian_name?: string | null;
          id?: string;
          memo?: string | null;
          order_id?: string | null;
          paid_amount?: number | null;
          payment_status?: string | null;
          phone?: string | null;
          price?: number | null;
          profile_id?: string | null;
          program_name?: string | null;
          school_name?: string | null;
          student_name?: string | null;
          term_name?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "enrollments_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      faqs: {
        Row: {
          answer: string | null;
          category: string;
          content_json: Json | null;
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          question: string;
          sort_order: number | null;
          updated_at: string | null;
        };
        Insert: {
          answer?: string | null;
          category?: string;
          content_json?: Json | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          question?: string;
          sort_order?: number | null;
          updated_at?: string | null;
        };
        Update: {
          answer?: string | null;
          category?: string;
          content_json?: Json | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          question?: string;
          sort_order?: number | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      galleries: {
        Row: {
          category: string | null;
          content: string | null;
          content_json: Json | null;
          created_at: string | null;
          id: string;
          image_url: string | null;
          image_urls: Json;
          is_active: boolean | null;
          is_featured: boolean;
          published_at: string | null;
          sort_order: number | null;
          title: string;
          updated_at: string | null;
          view_count: number;
        };
        Insert: {
          category?: string | null;
          content?: string | null;
          content_json?: Json | null;
          created_at?: string | null;
          id?: string;
          image_url?: string | null;
          image_urls?: Json;
          is_active?: boolean | null;
          is_featured?: boolean;
          published_at?: string | null;
          sort_order?: number | null;
          title?: string;
          updated_at?: string | null;
          view_count?: number;
        };
        Update: {
          category?: string | null;
          content?: string | null;
          content_json?: Json | null;
          created_at?: string | null;
          id?: string;
          image_url?: string | null;
          image_urls?: Json;
          is_active?: boolean | null;
          is_featured?: boolean;
          published_at?: string | null;
          sort_order?: number | null;
          title?: string;
          updated_at?: string | null;
          view_count?: number;
        };
        Relationships: [];
      };
      goal_advice_cache: {
        Row: {
          created_at: string;
          generated_for: string;
          id: number;
          origin: string;
          payload: Json;
          profile_id: string;
          source: string;
        };
        Insert: {
          created_at?: string;
          generated_for: string;
          id?: never;
          origin: string;
          payload: Json;
          profile_id: string;
          source: string;
        };
        Update: {
          created_at?: string;
          generated_for?: string;
          id?: never;
          origin?: string;
          payload?: Json;
          profile_id?: string;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_advice_cache_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_student_state";
            referencedColumns: ["profile_id"];
          },
          {
            foreignKeyName: "goal_advice_cache_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_students";
            referencedColumns: ["profile_id"];
          },
        ];
      };
      goal_daily_records: {
        Row: {
          achievement: string;
          body_condition: string;
          created_at: string;
          delta_ideal_jungsi: number;
          delta_ideal_susi: number;
          delta_min_jungsi: number;
          delta_min_susi: number;
          focus: string;
          id: number;
          memo: string;
          profile_id: string;
          reasons: string[];
          record_date: string;
          record_index: number;
          study_hours: number;
          submitted_at: string;
          submitted_on: string;
          target_ideal_hours: number;
          target_min_hours: number;
          tasks: string[];
          updated_at: string;
          virtual_day_index: number | null;
        };
        Insert: {
          achievement?: string;
          body_condition?: string;
          created_at?: string;
          delta_ideal_jungsi?: number;
          delta_ideal_susi?: number;
          delta_min_jungsi?: number;
          delta_min_susi?: number;
          focus?: string;
          id?: number;
          memo?: string;
          profile_id: string;
          reasons?: string[];
          record_date: string;
          record_index: number;
          study_hours?: number;
          submitted_at?: string;
          submitted_on: string;
          target_ideal_hours?: number;
          target_min_hours?: number;
          tasks?: string[];
          updated_at?: string;
          virtual_day_index?: number | null;
        };
        Update: {
          achievement?: string;
          body_condition?: string;
          created_at?: string;
          delta_ideal_jungsi?: number;
          delta_ideal_susi?: number;
          delta_min_jungsi?: number;
          delta_min_susi?: number;
          focus?: string;
          id?: number;
          memo?: string;
          profile_id?: string;
          reasons?: string[];
          record_date?: string;
          record_index?: number;
          study_hours?: number;
          submitted_at?: string;
          submitted_on?: string;
          target_ideal_hours?: number;
          target_min_hours?: number;
          tasks?: string[];
          updated_at?: string;
          virtual_day_index?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "goal_daily_records_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_student_state";
            referencedColumns: ["profile_id"];
          },
          {
            foreignKeyName: "goal_daily_records_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_students";
            referencedColumns: ["profile_id"];
          },
        ];
      };
      goal_direction_reports: {
        Row: {
          created_at: string;
          id: number;
          kind: string;
          payload: Json;
          profile_id: string;
          snapshot: Json;
          source_label: string;
          source_type: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          kind: string;
          payload: Json;
          profile_id: string;
          snapshot: Json;
          source_label: string;
          source_type: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          kind?: string;
          payload?: Json;
          profile_id?: string;
          snapshot?: Json;
          source_label?: string;
          source_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_direction_reports_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_student_state";
            referencedColumns: ["profile_id"];
          },
          {
            foreignKeyName: "goal_direction_reports_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_students";
            referencedColumns: ["profile_id"];
          },
        ];
      };
      goal_mentor_comments: {
        Row: {
          body: string;
          created_at: string;
          id: number;
          period_key: string;
          period_type: string;
          profile_id: string;
          updated_at: string;
          written_at: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: number;
          period_key: string;
          period_type: string;
          profile_id: string;
          updated_at?: string;
          written_at?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: number;
          period_key?: string;
          period_type?: string;
          profile_id?: string;
          updated_at?: string;
          written_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_mentor_comments_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_student_state";
            referencedColumns: ["profile_id"];
          },
          {
            foreignKeyName: "goal_mentor_comments_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_students";
            referencedColumns: ["profile_id"];
          },
        ];
      };
      goal_plan_tasks: {
        Row: {
          created_at: string;
          done: boolean;
          duration_minutes: number;
          id: number;
          page_from: number | null;
          page_to: number | null;
          plan_date: string;
          profile_id: string;
          sort_order: number;
          status: string;
          subject: string;
          title: string;
          updated_at: string;
          workbook_id: number | null;
        };
        Insert: {
          created_at?: string;
          done?: boolean;
          duration_minutes?: number;
          id?: number;
          page_from?: number | null;
          page_to?: number | null;
          plan_date: string;
          profile_id: string;
          sort_order?: number;
          status?: string;
          subject: string;
          title: string;
          updated_at?: string;
          workbook_id?: number | null;
        };
        Update: {
          created_at?: string;
          done?: boolean;
          duration_minutes?: number;
          id?: number;
          page_from?: number | null;
          page_to?: number | null;
          plan_date?: string;
          profile_id?: string;
          sort_order?: number;
          status?: string;
          subject?: string;
          title?: string;
          updated_at?: string;
          workbook_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "goal_plan_tasks_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_student_state";
            referencedColumns: ["profile_id"];
          },
          {
            foreignKeyName: "goal_plan_tasks_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_students";
            referencedColumns: ["profile_id"];
          },
          {
            foreignKeyName: "goal_plan_tasks_workbook_id_fkey";
            columns: ["workbook_id"];
            isOneToOne: false;
            referencedRelation: "goal_workbooks";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_probability_logs: {
        Row: {
          created_at: string;
          id: number;
          ideal_jungsi: number | null;
          ideal_susi: number;
          min_jungsi: number | null;
          min_susi: number;
          profile_id: string;
          reason: string;
          source_record_id: number | null;
        };
        Insert: {
          created_at?: string;
          id?: number;
          ideal_jungsi?: number | null;
          ideal_susi: number;
          min_jungsi?: number | null;
          min_susi: number;
          profile_id: string;
          reason: string;
          source_record_id?: number | null;
        };
        Update: {
          created_at?: string;
          id?: number;
          ideal_jungsi?: number | null;
          ideal_susi?: number;
          min_jungsi?: number | null;
          min_susi?: number;
          profile_id?: string;
          reason?: string;
          source_record_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "goal_probability_logs_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_student_state";
            referencedColumns: ["profile_id"];
          },
          {
            foreignKeyName: "goal_probability_logs_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_students";
            referencedColumns: ["profile_id"];
          },
          {
            foreignKeyName: "goal_probability_logs_source_record_id_fkey";
            columns: ["source_record_id"];
            isOneToOne: false;
            referencedRelation: "goal_daily_records";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_schedules: {
        Row: {
          category: string;
          created_at: string;
          due_date: string;
          id: number;
          memo: string;
          profile_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          due_date: string;
          id?: number;
          memo?: string;
          profile_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          due_date?: string;
          id?: number;
          memo?: string;
          profile_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_schedules_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_student_state";
            referencedColumns: ["profile_id"];
          },
          {
            foreignKeyName: "goal_schedules_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_students";
            referencedColumns: ["profile_id"];
          },
        ];
      };
      goal_students: {
        Row: {
          actual_start_date: string | null;
          base_ideal_jungsi: number | null;
          base_ideal_susi: number | null;
          base_min_jungsi: number | null;
          base_min_susi: number | null;
          converted_grade: number | null;
          created_at: string;
          current_mogo: number | null;
          current_score: number | null;
          grade: string;
          ideal_department: string;
          ideal_jungsi_cut: number | null;
          ideal_naesin_cut: number | null;
          ideal_university: string;
          last_mogo_exam: string;
          last_naesin_exam: string;
          min_department: string;
          min_jungsi_cut: number | null;
          min_naesin_cut: number | null;
          min_university: string;
          mock_exam_scores: Json | null;
          naesin_scores: Json | null;
          onboarded_at: string | null;
          profile_id: string;
          rate_ideal_jungsi: number | null;
          rate_ideal_susi: number | null;
          rate_min_jungsi: number | null;
          rate_min_susi: number | null;
          remain_mogo: number;
          remain_naesin: number;
          school_type: string;
          status: string;
          study_schedule: Json;
          updated_at: string;
          week_ideal: number;
          week_min: number;
          week_schedule_input: Json | null;
        };
        Insert: {
          actual_start_date?: string | null;
          base_ideal_jungsi?: number | null;
          base_ideal_susi?: number | null;
          base_min_jungsi?: number | null;
          base_min_susi?: number | null;
          converted_grade?: number | null;
          created_at?: string;
          current_mogo?: number | null;
          current_score?: number | null;
          grade: string;
          ideal_department?: string;
          ideal_jungsi_cut?: number | null;
          ideal_naesin_cut?: number | null;
          ideal_university?: string;
          last_mogo_exam?: string;
          last_naesin_exam?: string;
          min_department?: string;
          min_jungsi_cut?: number | null;
          min_naesin_cut?: number | null;
          min_university?: string;
          mock_exam_scores?: Json | null;
          naesin_scores?: Json | null;
          onboarded_at?: string | null;
          profile_id: string;
          rate_ideal_jungsi?: number | null;
          rate_ideal_susi?: number | null;
          rate_min_jungsi?: number | null;
          rate_min_susi?: number | null;
          remain_mogo?: number;
          remain_naesin?: number;
          school_type: string;
          status?: string;
          study_schedule?: Json;
          updated_at?: string;
          week_ideal?: number;
          week_min?: number;
          week_schedule_input?: Json | null;
        };
        Update: {
          actual_start_date?: string | null;
          base_ideal_jungsi?: number | null;
          base_ideal_susi?: number | null;
          base_min_jungsi?: number | null;
          base_min_susi?: number | null;
          converted_grade?: number | null;
          created_at?: string;
          current_mogo?: number | null;
          current_score?: number | null;
          grade?: string;
          ideal_department?: string;
          ideal_jungsi_cut?: number | null;
          ideal_naesin_cut?: number | null;
          ideal_university?: string;
          last_mogo_exam?: string;
          last_naesin_exam?: string;
          min_department?: string;
          min_jungsi_cut?: number | null;
          min_naesin_cut?: number | null;
          min_university?: string;
          mock_exam_scores?: Json | null;
          naesin_scores?: Json | null;
          onboarded_at?: string | null;
          profile_id?: string;
          rate_ideal_jungsi?: number | null;
          rate_ideal_susi?: number | null;
          rate_min_jungsi?: number | null;
          rate_min_susi?: number | null;
          remain_mogo?: number;
          remain_naesin?: number;
          school_type?: string;
          status?: string;
          study_schedule?: Json;
          updated_at?: string;
          week_ideal?: number;
          week_min?: number;
          week_schedule_input?: Json | null;
        };
        Relationships: [];
      };
      goal_subject_targets: {
        Row: {
          created_at: string;
          profile_id: string;
          subject: string;
          target_hours: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          profile_id: string;
          subject: string;
          target_hours: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          profile_id?: string;
          subject?: string;
          target_hours?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_subject_targets_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_student_state";
            referencedColumns: ["profile_id"];
          },
          {
            foreignKeyName: "goal_subject_targets_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_students";
            referencedColumns: ["profile_id"];
          },
        ];
      };
      goal_timer_sessions: {
        Row: {
          created_at: string;
          duration_seconds: number | null;
          end_reason: string | null;
          ended_at: string | null;
          id: number;
          last_heartbeat_at: string | null;
          profile_id: string;
          session_date: string;
          started_at: string;
          subject: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          duration_seconds?: number | null;
          end_reason?: string | null;
          ended_at?: string | null;
          id?: number;
          last_heartbeat_at?: string | null;
          profile_id: string;
          session_date: string;
          started_at: string;
          subject: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          duration_seconds?: number | null;
          end_reason?: string | null;
          ended_at?: string | null;
          id?: number;
          last_heartbeat_at?: string | null;
          profile_id?: string;
          session_date?: string;
          started_at?: string;
          subject?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_timer_sessions_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_student_state";
            referencedColumns: ["profile_id"];
          },
          {
            foreignKeyName: "goal_timer_sessions_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_students";
            referencedColumns: ["profile_id"];
          },
        ];
      };
      goal_timer_subjects: {
        Row: {
          created_at: string;
          profile_id: string;
          sort_order: number;
          subject: string;
        };
        Insert: {
          created_at?: string;
          profile_id: string;
          sort_order?: number;
          subject: string;
        };
        Update: {
          created_at?: string;
          profile_id?: string;
          sort_order?: number;
          subject?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_timer_subjects_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_student_state";
            referencedColumns: ["profile_id"];
          },
          {
            foreignKeyName: "goal_timer_subjects_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_students";
            referencedColumns: ["profile_id"];
          },
        ];
      };
      goal_university_cuts: {
        Row: {
          avg_cut: number | null;
          created_at: string;
          cut_type: string;
          department_key: string;
          department_name: string;
          id: number;
          is_active: boolean;
          note: string | null;
          source: string | null;
          source_year: number | null;
          university_key: string;
          university_name: string;
          updated_at: string;
        };
        Insert: {
          avg_cut?: number | null;
          created_at?: string;
          cut_type: string;
          department_key?: string;
          department_name?: string;
          id?: number;
          is_active?: boolean;
          note?: string | null;
          source?: string | null;
          source_year?: number | null;
          university_key: string;
          university_name: string;
          updated_at?: string;
        };
        Update: {
          avg_cut?: number | null;
          created_at?: string;
          cut_type?: string;
          department_key?: string;
          department_name?: string;
          id?: number;
          is_active?: boolean;
          note?: string | null;
          source?: string | null;
          source_year?: number | null;
          university_key?: string;
          university_name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      goal_workbooks: {
        Row: {
          created_at: string;
          current_page: number;
          id: number;
          profile_id: string;
          shelved_at: string | null;
          status: string;
          subject: string;
          title: string;
          total_pages: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          current_page?: number;
          id?: never;
          profile_id: string;
          shelved_at?: string | null;
          status?: string;
          subject: string;
          title: string;
          total_pages: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          current_page?: number;
          id?: never;
          profile_id?: string;
          shelved_at?: string | null;
          status?: string;
          subject?: string;
          title?: string;
          total_pages?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_workbooks_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_student_state";
            referencedColumns: ["profile_id"];
          },
          {
            foreignKeyName: "goal_workbooks_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "goal_students";
            referencedColumns: ["profile_id"];
          },
        ];
      };
      home_acceptance_cards: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          image_url: string | null;
          is_active: boolean;
          link_url: string | null;
          open_new_window: boolean;
          result_title: string;
          sort_order: number;
          student_name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          link_url?: string | null;
          open_new_window?: boolean;
          result_title: string;
          sort_order?: number;
          student_name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          link_url?: string | null;
          open_new_window?: boolean;
          result_title?: string;
          sort_order?: number;
          student_name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      home_mentor_strategies: {
        Row: {
          badge: string | null;
          card_width: number | null;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          link_url: string | null;
          mentor_name: string;
          open_new_window: boolean;
          photo_layout: Json | null;
          photo_url: string | null;
          sort_order: number;
          title: string;
          title_lines: Json | null;
          updated_at: string;
        };
        Insert: {
          badge?: string | null;
          card_width?: number | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          link_url?: string | null;
          mentor_name: string;
          open_new_window?: boolean;
          photo_layout?: Json | null;
          photo_url?: string | null;
          sort_order?: number;
          title: string;
          title_lines?: Json | null;
          updated_at?: string;
        };
        Update: {
          badge?: string | null;
          card_width?: number | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          link_url?: string | null;
          mentor_name?: string;
          open_new_window?: boolean;
          photo_layout?: Json | null;
          photo_url?: string | null;
          sort_order?: number;
          title?: string;
          title_lines?: Json | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      home_side_banners: {
        Row: {
          created_at: string;
          display_seconds: number;
          end_date: string | null;
          id: string;
          image_url: string | null;
          is_active: boolean;
          link_url: string | null;
          mobile_image_url: string | null;
          open_new_window: boolean;
          sort_order: number;
          start_date: string | null;
          subtitle: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_seconds?: number;
          end_date?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          link_url?: string | null;
          mobile_image_url?: string | null;
          open_new_window?: boolean;
          sort_order?: number;
          start_date?: string | null;
          subtitle?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_seconds?: number;
          end_date?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          link_url?: string | null;
          mobile_image_url?: string | null;
          open_new_window?: boolean;
          sort_order?: number;
          start_date?: string | null;
          subtitle?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      identity_verifications: {
        Row: {
          auth_iterators: number | null;
          auth_method: string | null;
          auth_ticket: string | null;
          birth_date: string | null;
          carrier: string | null;
          ci: string | null;
          consumed_at: string | null;
          created_at: string;
          di: string | null;
          error_code: string | null;
          error_message: string | null;
          expires_at: string;
          gender: string | null;
          id: string;
          is_under14: boolean | null;
          mobile: string | null;
          name: string | null;
          nationality: string | null;
          purpose: string;
          request_id: string;
          request_ip: unknown;
          requested_at: string;
          status: string;
          transaction_id: string | null;
          user_id: string | null;
          verified_at: string | null;
          web_transaction_id: string | null;
        };
        Insert: {
          auth_iterators?: number | null;
          auth_method?: string | null;
          auth_ticket?: string | null;
          birth_date?: string | null;
          carrier?: string | null;
          ci?: string | null;
          consumed_at?: string | null;
          created_at?: string;
          di?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          expires_at: string;
          gender?: string | null;
          id?: string;
          is_under14?: boolean | null;
          mobile?: string | null;
          name?: string | null;
          nationality?: string | null;
          purpose?: string;
          request_id: string;
          request_ip?: unknown;
          requested_at?: string;
          status?: string;
          transaction_id?: string | null;
          user_id?: string | null;
          verified_at?: string | null;
          web_transaction_id?: string | null;
        };
        Update: {
          auth_iterators?: number | null;
          auth_method?: string | null;
          auth_ticket?: string | null;
          birth_date?: string | null;
          carrier?: string | null;
          ci?: string | null;
          consumed_at?: string | null;
          created_at?: string;
          di?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          expires_at?: string;
          gender?: string | null;
          id?: string;
          is_under14?: boolean | null;
          mobile?: string | null;
          name?: string | null;
          nationality?: string | null;
          purpose?: string;
          request_id?: string;
          request_ip?: unknown;
          requested_at?: string;
          status?: string;
          transaction_id?: string | null;
          user_id?: string | null;
          verified_at?: string | null;
          web_transaction_id?: string | null;
        };
        Relationships: [];
      };
      learning_diagnosis_options: {
        Row: {
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          label: string | null;
          option_text: string;
          program_ids: string[] | null;
          program_keys: string | null;
          question_id: string | null;
          question_key: string | null;
          sort_order: number | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          label?: string | null;
          option_text: string;
          program_ids?: string[] | null;
          program_keys?: string | null;
          question_id?: string | null;
          question_key?: string | null;
          sort_order?: number | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          label?: string | null;
          option_text?: string;
          program_ids?: string[] | null;
          program_keys?: string | null;
          question_id?: string | null;
          question_key?: string | null;
          sort_order?: number | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "learning_diagnosis_options_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "learning_diagnosis_questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "learning_diagnosis_options_question_key_fkey";
            columns: ["question_key"];
            isOneToOne: false;
            referencedRelation: "learning_diagnosis_questions";
            referencedColumns: ["question_key"];
          },
        ];
      };
      learning_diagnosis_programs: {
        Row: {
          badge: string | null;
          created_at: string | null;
          description: string | null;
          icon: string | null;
          id: string;
          is_active: boolean | null;
          payment_button_text: string | null;
          payment_link: string | null;
          primary_button_link: string | null;
          primary_button_text: string | null;
          program_key: string | null;
          secondary_button_link: string | null;
          secondary_button_text: string | null;
          service_button_text: string | null;
          service_link: string | null;
          sort_order: number | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          badge?: string | null;
          created_at?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean | null;
          payment_button_text?: string | null;
          payment_link?: string | null;
          primary_button_link?: string | null;
          primary_button_text?: string | null;
          program_key?: string | null;
          secondary_button_link?: string | null;
          secondary_button_text?: string | null;
          service_button_text?: string | null;
          service_link?: string | null;
          sort_order?: number | null;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          badge?: string | null;
          created_at?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean | null;
          payment_button_text?: string | null;
          payment_link?: string | null;
          primary_button_link?: string | null;
          primary_button_text?: string | null;
          program_key?: string | null;
          secondary_button_link?: string | null;
          secondary_button_text?: string | null;
          service_button_text?: string | null;
          service_link?: string | null;
          sort_order?: number | null;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      learning_diagnosis_questions: {
        Row: {
          created_at: string | null;
          description: string | null;
          id: string;
          input_type: string;
          is_active: boolean | null;
          is_required: boolean | null;
          question_key: string | null;
          sort_order: number | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          input_type?: string;
          is_active?: boolean | null;
          is_required?: boolean | null;
          question_key?: string | null;
          sort_order?: number | null;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          input_type?: string;
          is_active?: boolean | null;
          is_required?: boolean | null;
          question_key?: string | null;
          sort_order?: number | null;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      learning_diagnosis_v2_survey_copy: {
        Row: {
          copy_key: string;
          copy_value: string;
          id: string;
          label: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          copy_key: string;
          copy_value?: string;
          id?: string;
          label?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          copy_key?: string;
          copy_value?: string;
          id?: string;
          label?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      link_code_lookups: {
        Row: {
          actor_id: string;
          code: string;
          created_at: string;
          found: boolean;
          id: string;
          request_ip: unknown;
        };
        Insert: {
          actor_id: string;
          code: string;
          created_at?: string;
          found: boolean;
          id?: string;
          request_ip?: unknown;
        };
        Update: {
          actor_id?: string;
          code?: string;
          created_at?: string;
          found?: boolean;
          id?: string;
          request_ip?: unknown;
        };
        Relationships: [];
      };
      mentor_applications: {
        Row: {
          admission_history: string;
          admission_year: number;
          agree_ad: boolean;
          agree_identity: boolean;
          agree_marketing: boolean;
          agree_privacy: boolean;
          agree_terms: boolean;
          available_timeslot: string;
          birth_date: string;
          consult_fields: string[];
          consult_grades: string[];
          created_at: string;
          csat_summary: string | null;
          email: string;
          enrollment_status: string;
          exam_results: string;
          final_admission_track: string;
          gender: string | null;
          gpa_average: number | null;
          highschool_name: string;
          highschool_region: string;
          highschool_type: string;
          id: string;
          ineffective_method: string;
          major: string;
          motivation: string;
          name: string;
          phone: string;
          phone_verified_at: string | null;
          proof_file_name: string | null;
          proof_file_path: string;
          request_ip: unknown;
          residence_region: string;
          situation_answer: string;
          status: string;
          strengths: string;
          strongest_field_reason: string;
          tutoring_experience: string | null;
          university: string;
          updated_at: string;
          user_id: string | null;
          weekly_capacity: string;
        };
        Insert: {
          admission_history: string;
          admission_year: number;
          agree_ad?: boolean;
          agree_identity?: boolean;
          agree_marketing?: boolean;
          agree_privacy?: boolean;
          agree_terms?: boolean;
          available_timeslot: string;
          birth_date: string;
          consult_fields: string[];
          consult_grades: string[];
          created_at?: string;
          csat_summary?: string | null;
          email: string;
          enrollment_status: string;
          exam_results: string;
          final_admission_track: string;
          gender?: string | null;
          gpa_average?: number | null;
          highschool_name: string;
          highschool_region: string;
          highschool_type: string;
          id?: string;
          ineffective_method: string;
          major: string;
          motivation: string;
          name: string;
          phone: string;
          phone_verified_at?: string | null;
          proof_file_name?: string | null;
          proof_file_path: string;
          request_ip?: unknown;
          residence_region: string;
          situation_answer: string;
          status?: string;
          strengths: string;
          strongest_field_reason: string;
          tutoring_experience?: string | null;
          university: string;
          updated_at?: string;
          user_id?: string | null;
          weekly_capacity: string;
        };
        Update: {
          admission_history?: string;
          admission_year?: number;
          agree_ad?: boolean;
          agree_identity?: boolean;
          agree_marketing?: boolean;
          agree_privacy?: boolean;
          agree_terms?: boolean;
          available_timeslot?: string;
          birth_date?: string;
          consult_fields?: string[];
          consult_grades?: string[];
          created_at?: string;
          csat_summary?: string | null;
          email?: string;
          enrollment_status?: string;
          exam_results?: string;
          final_admission_track?: string;
          gender?: string | null;
          gpa_average?: number | null;
          highschool_name?: string;
          highschool_region?: string;
          highschool_type?: string;
          id?: string;
          ineffective_method?: string;
          major?: string;
          motivation?: string;
          name?: string;
          phone?: string;
          phone_verified_at?: string | null;
          proof_file_name?: string | null;
          proof_file_path?: string;
          request_ip?: unknown;
          residence_region?: string;
          situation_answer?: string;
          status?: string;
          strengths?: string;
          strongest_field_reason?: string;
          tutoring_experience?: string | null;
          university?: string;
          updated_at?: string;
          user_id?: string | null;
          weekly_capacity?: string;
        };
        Relationships: [];
      };
      mentor_apply_copy: {
        Row: {
          copy_key: string;
          copy_value: string;
          id: string;
          label: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          copy_key: string;
          copy_value?: string;
          id?: string;
          label?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          copy_key?: string;
          copy_value?: string;
          id?: string;
          label?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      mentor_apply_faqs: {
        Row: {
          answer: string;
          created_at: string;
          id: string;
          is_active: boolean;
          is_notice: boolean;
          question: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          answer?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_notice?: boolean;
          question: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          answer?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_notice?: boolean;
          question?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      notices: {
        Row: {
          attachments: Json;
          category: string | null;
          content: string | null;
          created_at: string | null;
          file_name: string | null;
          file_url: string | null;
          id: string;
          image_url: string | null;
          image_urls: Json;
          is_active: boolean | null;
          is_pinned: boolean | null;
          sort_order: number | null;
          title: string;
          updated_at: string | null;
          view_count: number;
        };
        Insert: {
          attachments?: Json;
          category?: string | null;
          content?: string | null;
          created_at?: string | null;
          file_name?: string | null;
          file_url?: string | null;
          id?: string;
          image_url?: string | null;
          image_urls?: Json;
          is_active?: boolean | null;
          is_pinned?: boolean | null;
          sort_order?: number | null;
          title?: string;
          updated_at?: string | null;
          view_count?: number;
        };
        Update: {
          attachments?: Json;
          category?: string | null;
          content?: string | null;
          created_at?: string | null;
          file_name?: string | null;
          file_url?: string | null;
          id?: string;
          image_url?: string | null;
          image_urls?: Json;
          is_active?: boolean | null;
          is_pinned?: boolean | null;
          sort_order?: number | null;
          title?: string;
          updated_at?: string | null;
          view_count?: number;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          created_at: string;
          id: number;
          list_price: number;
          name: string;
          order_id: string;
          price: number;
          product_id: string | null;
          product_slug: string | null;
          quantity: number;
          service_key: string | null;
        };
        Insert: {
          created_at?: string;
          id?: never;
          list_price?: number;
          name: string;
          order_id: string;
          price?: number;
          product_id?: string | null;
          product_slug?: string | null;
          quantity?: number;
          service_key?: string | null;
        };
        Update: {
          created_at?: string;
          id?: never;
          list_price?: number;
          name?: string;
          order_id?: string;
          price?: number;
          product_id?: string | null;
          product_slug?: string | null;
          quantity?: number;
          service_key?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          amount: number;
          approval_status: string;
          coupon_id: string | null;
          created_at: string;
          customer_email: string;
          discount_amount: number;
          id: string;
          list_amount: number;
          method: string | null;
          order_name: string | null;
          paid_at: string | null;
          parent_profile_id: string;
          payment_key: string | null;
          raw: Json | null;
          reject_reason: string | null;
          requested_at: string;
          responded_at: string | null;
          status: string;
          student_profile_id: string;
          superseded_by_order_id: string | null;
          user_id: string;
        };
        Insert: {
          amount: number;
          approval_status?: string;
          coupon_id?: string | null;
          created_at?: string;
          customer_email: string;
          discount_amount?: number;
          id: string;
          list_amount?: number;
          method?: string | null;
          order_name?: string | null;
          paid_at?: string | null;
          parent_profile_id: string;
          payment_key?: string | null;
          raw?: Json | null;
          reject_reason?: string | null;
          requested_at?: string;
          responded_at?: string | null;
          status?: string;
          student_profile_id: string;
          superseded_by_order_id?: string | null;
          user_id: string;
        };
        Update: {
          amount?: number;
          approval_status?: string;
          coupon_id?: string | null;
          created_at?: string;
          customer_email?: string;
          discount_amount?: number;
          id?: string;
          list_amount?: number;
          method?: string | null;
          order_name?: string | null;
          paid_at?: string | null;
          parent_profile_id?: string;
          payment_key?: string | null;
          raw?: Json | null;
          reject_reason?: string | null;
          requested_at?: string;
          responded_at?: string | null;
          status?: string;
          student_profile_id?: string;
          superseded_by_order_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "coupon_wallet_state";
            referencedColumns: ["coupon_id"];
          },
          {
            foreignKeyName: "orders_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "coupons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_parent_profile_id_fkey";
            columns: ["parent_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_student_profile_id_fkey";
            columns: ["student_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_superseded_by_order_id_fkey";
            columns: ["superseded_by_order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      page_contents: {
        Row: {
          body: string | null;
          button_link: string | null;
          button_text: string | null;
          created_at: string | null;
          id: string;
          image_url: string | null;
          image_urls: Json;
          is_active: boolean | null;
          menu_group: string;
          menu_group_order: number | null;
          menu_label: string;
          slug: string;
          sort_order: number | null;
          subtitle: string | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          body?: string | null;
          button_link?: string | null;
          button_text?: string | null;
          created_at?: string | null;
          id?: string;
          image_url?: string | null;
          image_urls?: Json;
          is_active?: boolean | null;
          menu_group?: string;
          menu_group_order?: number | null;
          menu_label?: string;
          slug: string;
          sort_order?: number | null;
          subtitle?: string | null;
          title?: string;
          updated_at?: string | null;
        };
        Update: {
          body?: string | null;
          button_link?: string | null;
          button_text?: string | null;
          created_at?: string | null;
          id?: string;
          image_url?: string | null;
          image_urls?: Json;
          is_active?: boolean | null;
          menu_group?: string;
          menu_group_order?: number | null;
          menu_label?: string;
          slug?: string;
          sort_order?: number | null;
          subtitle?: string | null;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      parent_child_links: {
        Row: {
          created_at: string;
          id: string;
          link_code_id: string | null;
          parent_id: string;
          requested_at: string;
          responded_at: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          status: string;
          student_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          link_code_id?: string | null;
          parent_id: string;
          requested_at?: string;
          responded_at?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          status?: string;
          student_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          link_code_id?: string | null;
          parent_id?: string;
          requested_at?: string;
          responded_at?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          status?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "parent_child_links_link_code_id_fkey";
            columns: ["link_code_id"];
            isOneToOne: false;
            referencedRelation: "student_link_codes";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          created_at: string | null;
          id: string;
          order_id: string | null;
          paid_at: string | null;
          payment_id: string;
          payment_provider: string | null;
          program_key: string;
          provider_payment_id: string | null;
          raw_payload: Json | null;
          status: string;
        };
        Insert: {
          amount?: number;
          created_at?: string | null;
          id: string;
          order_id?: string | null;
          paid_at?: string | null;
          payment_id?: string;
          payment_provider?: string | null;
          program_key: string;
          provider_payment_id?: string | null;
          raw_payload?: Json | null;
          status?: string;
        };
        Update: {
          amount?: number;
          created_at?: string | null;
          id?: string;
          order_id?: string | null;
          paid_at?: string | null;
          payment_id?: string;
          payment_provider?: string | null;
          program_key?: string;
          provider_payment_id?: string | null;
          raw_payload?: Json | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_id_fkey";
            columns: ["id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_program_key_fkey";
            columns: ["program_key"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["program_key"];
          },
        ];
      };
      performance_attachments: {
        Row: {
          byte_size: number | null;
          cleanup_attempts: number;
          cleanup_last_error_at: string | null;
          created_at: string;
          deleted_at: string | null;
          id: string;
          mime_type: string | null;
          ocr_status: string;
          ocr_text: string | null;
          session_id: string;
          storage_path: string | null;
        };
        Insert: {
          byte_size?: number | null;
          cleanup_attempts?: number;
          cleanup_last_error_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          mime_type?: string | null;
          ocr_status?: string;
          ocr_text?: string | null;
          session_id: string;
          storage_path?: string | null;
        };
        Update: {
          byte_size?: number | null;
          cleanup_attempts?: number;
          cleanup_last_error_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          mime_type?: string | null;
          ocr_status?: string;
          ocr_text?: string | null;
          session_id?: string;
          storage_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "performance_attachments_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "performance_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_attachments_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "v_performance_saved_reports";
            referencedColumns: ["session_id"];
          },
        ];
      };
      performance_credit_ledger: {
        Row: {
          created_at: string;
          delta: number;
          grant_id: string;
          id: string;
          profile_id: string;
          reason: string | null;
          reversal_of: string | null;
          session_id: string | null;
          source_kind: string;
        };
        Insert: {
          created_at?: string;
          delta?: number;
          grant_id: string;
          id?: string;
          profile_id: string;
          reason?: string | null;
          reversal_of?: string | null;
          session_id?: string | null;
          source_kind?: string;
        };
        Update: {
          created_at?: string;
          delta?: number;
          grant_id?: string;
          id?: string;
          profile_id?: string;
          reason?: string | null;
          reversal_of?: string | null;
          session_id?: string | null;
          source_kind?: string;
        };
        Relationships: [
          {
            foreignKeyName: "performance_credit_ledger_grant_id_fkey";
            columns: ["grant_id"];
            isOneToOne: false;
            referencedRelation: "program_access_grants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_credit_ledger_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_credit_ledger_reversal_of_fkey";
            columns: ["reversal_of"];
            isOneToOne: false;
            referencedRelation: "performance_credit_ledger";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_credit_ledger_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: true;
            referencedRelation: "performance_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_credit_ledger_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: true;
            referencedRelation: "v_performance_saved_reports";
            referencedColumns: ["session_id"];
          },
        ];
      };
      performance_messages: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          kind: string;
          payload: Json | null;
          role: string;
          seq: number;
          session_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          payload?: Json | null;
          role: string;
          seq: number;
          session_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          payload?: Json | null;
          role?: string;
          seq?: number;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "performance_messages_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "performance_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_messages_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "v_performance_saved_reports";
            referencedColumns: ["session_id"];
          },
        ];
      };
      performance_reports: {
        Row: {
          created_at: string;
          id: string;
          model: string | null;
          prompt_version: string | null;
          report_type: string;
          score: number | null;
          sections: Json;
          session_id: string;
          submission_id: string | null;
          summary: string | null;
          topic_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          model?: string | null;
          prompt_version?: string | null;
          report_type: string;
          score?: number | null;
          sections: Json;
          session_id: string;
          submission_id?: string | null;
          summary?: string | null;
          topic_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          model?: string | null;
          prompt_version?: string | null;
          report_type?: string;
          score?: number | null;
          sections?: Json;
          session_id?: string;
          submission_id?: string | null;
          summary?: string | null;
          topic_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "performance_reports_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "performance_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_reports_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "v_performance_saved_reports";
            referencedColumns: ["session_id"];
          },
          {
            foreignKeyName: "performance_reports_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "performance_submissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_reports_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "performance_topics";
            referencedColumns: ["id"];
          },
        ];
      };
      performance_session_vectors: {
        Row: {
          career_goal: string | null;
          content_hash: string | null;
          created_at: string;
          embedded_at: string | null;
          embedding: string | null;
          embedding_error: string | null;
          embedding_model: string | null;
          embedding_status: string;
          grade_label: string | null;
          profile_id: string;
          rag_use: boolean;
          search_text: string | null;
          session_id: string;
          subject: string | null;
          subject_group: string | null;
          summary_text: string | null;
          topic_title: string | null;
          updated_at: string;
        };
        Insert: {
          career_goal?: string | null;
          content_hash?: string | null;
          created_at?: string;
          embedded_at?: string | null;
          embedding?: string | null;
          embedding_error?: string | null;
          embedding_model?: string | null;
          embedding_status?: string;
          grade_label?: string | null;
          profile_id: string;
          rag_use?: boolean;
          search_text?: string | null;
          session_id: string;
          subject?: string | null;
          subject_group?: string | null;
          summary_text?: string | null;
          topic_title?: string | null;
          updated_at?: string;
        };
        Update: {
          career_goal?: string | null;
          content_hash?: string | null;
          created_at?: string;
          embedded_at?: string | null;
          embedding?: string | null;
          embedding_error?: string | null;
          embedding_model?: string | null;
          embedding_status?: string;
          grade_label?: string | null;
          profile_id?: string;
          rag_use?: boolean;
          search_text?: string | null;
          session_id?: string;
          subject?: string | null;
          subject_group?: string | null;
          summary_text?: string | null;
          topic_title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "performance_session_vectors_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_session_vectors_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: true;
            referencedRelation: "performance_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_session_vectors_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: true;
            referencedRelation: "v_performance_saved_reports";
            referencedColumns: ["session_id"];
          },
        ];
      };
      performance_sessions: {
        Row: {
          career_goal: string | null;
          completed_steps: number[];
          created_at: string;
          current_step: number;
          design_attempt_count: number;
          design_generation_count: number;
          evaluation_attempt_count: number;
          evaluation_count: number;
          grade_label: string | null;
          guide_analysis_count: number;
          guide_freetext: string | null;
          guide_input_mode: string | null;
          guide_json: Json | null;
          id: string;
          previous_topic: string | null;
          profile_id: string;
          school_type: string | null;
          selected_topic_id: string | null;
          semester: string | null;
          status: string;
          subject: string | null;
          subject_group: string | null;
          submission_format: string | null;
          submission_schema: Json | null;
          topic_attempt_count: number;
          updated_at: string;
        };
        Insert: {
          career_goal?: string | null;
          completed_steps?: number[];
          created_at?: string;
          current_step?: number;
          design_attempt_count?: number;
          design_generation_count?: number;
          evaluation_attempt_count?: number;
          evaluation_count?: number;
          grade_label?: string | null;
          guide_analysis_count?: number;
          guide_freetext?: string | null;
          guide_input_mode?: string | null;
          guide_json?: Json | null;
          id?: string;
          previous_topic?: string | null;
          profile_id: string;
          school_type?: string | null;
          selected_topic_id?: string | null;
          semester?: string | null;
          status?: string;
          subject?: string | null;
          subject_group?: string | null;
          submission_format?: string | null;
          submission_schema?: Json | null;
          topic_attempt_count?: number;
          updated_at?: string;
        };
        Update: {
          career_goal?: string | null;
          completed_steps?: number[];
          created_at?: string;
          current_step?: number;
          design_attempt_count?: number;
          design_generation_count?: number;
          evaluation_attempt_count?: number;
          evaluation_count?: number;
          grade_label?: string | null;
          guide_analysis_count?: number;
          guide_freetext?: string | null;
          guide_input_mode?: string | null;
          guide_json?: Json | null;
          id?: string;
          previous_topic?: string | null;
          profile_id?: string;
          school_type?: string | null;
          selected_topic_id?: string | null;
          semester?: string | null;
          status?: string;
          subject?: string | null;
          subject_group?: string | null;
          submission_format?: string | null;
          submission_schema?: Json | null;
          topic_attempt_count?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "performance_sessions_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_sessions_selected_topic_id_fkey";
            columns: ["selected_topic_id"];
            isOneToOne: false;
            referencedRelation: "performance_topics";
            referencedColumns: ["id"];
          },
        ];
      };
      performance_submissions: {
        Row: {
          char_counts: Json | null;
          created_at: string;
          fields: Json;
          finalize_reason: string | null;
          finalized_at: string | null;
          id: string;
          is_draft: boolean;
          is_final: boolean;
          revision: number;
          session_id: string;
          submitted_at: string | null;
          updated_at: string;
        };
        Insert: {
          char_counts?: Json | null;
          created_at?: string;
          fields: Json;
          finalize_reason?: string | null;
          finalized_at?: string | null;
          id?: string;
          is_draft?: boolean;
          is_final?: boolean;
          revision?: number;
          session_id: string;
          submitted_at?: string | null;
          updated_at?: string;
        };
        Update: {
          char_counts?: Json | null;
          created_at?: string;
          fields?: Json;
          finalize_reason?: string | null;
          finalized_at?: string | null;
          id?: string;
          is_draft?: boolean;
          is_final?: boolean;
          revision?: number;
          session_id?: string;
          submitted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "performance_submissions_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "performance_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_submissions_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "v_performance_saved_reports";
            referencedColumns: ["session_id"];
          },
        ];
      };
      performance_topics: {
        Row: {
          created_at: string;
          detail: Json | null;
          id: string;
          idx: number;
          round: number;
          selected: boolean;
          session_id: string;
          subtitle: string | null;
          tags: string[] | null;
          title: string | null;
        };
        Insert: {
          created_at?: string;
          detail?: Json | null;
          id?: string;
          idx: number;
          round?: number;
          selected?: boolean;
          session_id: string;
          subtitle?: string | null;
          tags?: string[] | null;
          title?: string | null;
        };
        Update: {
          created_at?: string;
          detail?: Json | null;
          id?: string;
          idx?: number;
          round?: number;
          selected?: boolean;
          session_id?: string;
          subtitle?: string | null;
          tags?: string[] | null;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "performance_topics_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "performance_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_topics_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "v_performance_saved_reports";
            referencedColumns: ["session_id"];
          },
        ];
      };
      phone_verifications: {
        Row: {
          attempt_count: number;
          code_hash: string;
          consumed_at: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          phone: string;
          purpose: string;
          request_ip: unknown;
          user_id: string | null;
          verified_at: string | null;
        };
        Insert: {
          attempt_count?: number;
          code_hash: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at: string;
          id?: string;
          phone: string;
          purpose?: string;
          request_ip?: unknown;
          user_id?: string | null;
          verified_at?: string | null;
        };
        Update: {
          attempt_count?: number;
          code_hash?: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          phone?: string;
          purpose?: string;
          request_ip?: unknown;
          user_id?: string | null;
          verified_at?: string | null;
        };
        Relationships: [];
      };
      popups: {
        Row: {
          content: string | null;
          created_at: string | null;
          end_date: string | null;
          id: string;
          image_url: string | null;
          is_active: boolean | null;
          mobile_image_url: string | null;
          open_new_window: boolean | null;
          sort_order: number | null;
          start_date: string | null;
          title: string;
          updated_at: string | null;
          url: string | null;
        };
        Insert: {
          content?: string | null;
          created_at?: string | null;
          end_date?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean | null;
          mobile_image_url?: string | null;
          open_new_window?: boolean | null;
          sort_order?: number | null;
          start_date?: string | null;
          title?: string;
          updated_at?: string | null;
          url?: string | null;
        };
        Update: {
          content?: string | null;
          created_at?: string | null;
          end_date?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean | null;
          mobile_image_url?: string | null;
          open_new_window?: boolean | null;
          sort_order?: number | null;
          start_date?: string | null;
          title?: string;
          updated_at?: string | null;
          url?: string | null;
        };
        Relationships: [];
      };
      premium_book_pages: {
        Row: {
          created_at: string;
          id: number;
          image_url: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          image_url?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          image_url?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      premium_consult_requests: {
        Row: {
          admin_note: string;
          created_at: string;
          email: string;
          id: number;
          message: string;
          name: string;
          phone: string;
          service: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          admin_note?: string;
          created_at?: string;
          email?: string;
          id?: number;
          message?: string;
          name: string;
          phone: string;
          service?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          admin_note?: string;
          created_at?: string;
          email?: string;
          id?: number;
          message?: string;
          name?: string;
          phone?: string;
          service?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          badge: string | null;
          created_at: string;
          duration_months: number | null;
          id: string;
          is_active: boolean;
          is_orderable: boolean;
          is_recommended: boolean;
          list_price: number;
          name: string;
          org_code: string | null;
          price: number;
          program_key: string | null;
          sale_ends_at: string | null;
          service_desc: string | null;
          service_key: string;
          service_name: string;
          service_sort_order: number;
          session_quota: number | null;
          slug: string;
          sort_order: number;
          tenant_id: string | null;
          validity_days: number | null;
        };
        Insert: {
          badge?: string | null;
          created_at?: string;
          duration_months?: number | null;
          id?: string;
          is_active?: boolean;
          is_orderable?: boolean;
          is_recommended?: boolean;
          list_price: number;
          name: string;
          org_code?: string | null;
          price: number;
          program_key?: string | null;
          sale_ends_at?: string | null;
          service_desc?: string | null;
          service_key: string;
          service_name: string;
          service_sort_order?: number;
          session_quota?: number | null;
          slug: string;
          sort_order?: number;
          tenant_id?: string | null;
          validity_days?: number | null;
        };
        Update: {
          badge?: string | null;
          created_at?: string;
          duration_months?: number | null;
          id?: string;
          is_active?: boolean;
          is_orderable?: boolean;
          is_recommended?: boolean;
          list_price?: number;
          name?: string;
          org_code?: string | null;
          price?: number;
          program_key?: string | null;
          sale_ends_at?: string | null;
          service_desc?: string | null;
          service_key?: string;
          service_name?: string;
          service_sort_order?: number;
          session_quota?: number | null;
          slug?: string;
          sort_order?: number;
          tenant_id?: string | null;
          validity_days?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "products_program_key_fkey";
            columns: ["program_key"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["program_key"];
          },
          {
            foreignKeyName: "products_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          address: string | null;
          address_detail: string | null;
          ads_agreed: boolean | null;
          birth_date: string | null;
          created_at: string | null;
          email: string | null;
          gender: string | null;
          guardian_consent: boolean | null;
          guardian_phone: string | null;
          id: string;
          is_active: boolean | null;
          landline: string | null;
          marketing_agreed: boolean | null;
          member_category: string | null;
          member_type: string | null;
          memo: string | null;
          name: string | null;
          org_code: string | null;
          payment_terminal_id: string | null;
          phone: string | null;
          privacy_optional_agreed: boolean | null;
          privacy_required_agreed: boolean | null;
          region: string | null;
          role: string;
          school_name: string | null;
          school_type: string | null;
          sms_agreed: boolean | null;
          tenant_id: string | null;
          terms_service_agreed: boolean | null;
          updated_at: string | null;
          username: string | null;
        };
        Insert: {
          address?: string | null;
          address_detail?: string | null;
          ads_agreed?: boolean | null;
          birth_date?: string | null;
          created_at?: string | null;
          email?: string | null;
          gender?: string | null;
          guardian_consent?: boolean | null;
          guardian_phone?: string | null;
          id: string;
          is_active?: boolean | null;
          landline?: string | null;
          marketing_agreed?: boolean | null;
          member_category?: string | null;
          member_type?: string | null;
          memo?: string | null;
          name?: string | null;
          org_code?: string | null;
          payment_terminal_id?: string | null;
          phone?: string | null;
          privacy_optional_agreed?: boolean | null;
          privacy_required_agreed?: boolean | null;
          region?: string | null;
          role?: string;
          school_name?: string | null;
          school_type?: string | null;
          sms_agreed?: boolean | null;
          tenant_id?: string | null;
          terms_service_agreed?: boolean | null;
          updated_at?: string | null;
          username?: string | null;
        };
        Update: {
          address?: string | null;
          address_detail?: string | null;
          ads_agreed?: boolean | null;
          birth_date?: string | null;
          created_at?: string | null;
          email?: string | null;
          gender?: string | null;
          guardian_consent?: boolean | null;
          guardian_phone?: string | null;
          id?: string;
          is_active?: boolean | null;
          landline?: string | null;
          marketing_agreed?: boolean | null;
          member_category?: string | null;
          member_type?: string | null;
          memo?: string | null;
          name?: string | null;
          org_code?: string | null;
          payment_terminal_id?: string | null;
          phone?: string | null;
          privacy_optional_agreed?: boolean | null;
          privacy_required_agreed?: boolean | null;
          region?: string | null;
          role?: string;
          school_name?: string | null;
          school_type?: string | null;
          sms_agreed?: boolean | null;
          tenant_id?: string | null;
          terms_service_agreed?: boolean | null;
          updated_at?: string | null;
          username?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      program_access: {
        Row: {
          access_expires_at: string | null;
          access_started_at: string | null;
          access_status: string;
          created_at: string | null;
          expires_at: string | null;
          id: string;
          memo: string | null;
          meta: Json | null;
          paid_amount: number | null;
          paid_at: string | null;
          payment_status: string;
          profile_id: string | null;
          program_key: string;
          starts_at: string | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          access_expires_at?: string | null;
          access_started_at?: string | null;
          access_status?: string;
          created_at?: string | null;
          expires_at?: string | null;
          id: string;
          memo?: string | null;
          meta?: Json | null;
          paid_amount?: number | null;
          paid_at?: string | null;
          payment_status?: string;
          profile_id?: string | null;
          program_key: string;
          starts_at?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          access_expires_at?: string | null;
          access_started_at?: string | null;
          access_status?: string;
          created_at?: string | null;
          expires_at?: string | null;
          id?: string;
          memo?: string | null;
          meta?: Json | null;
          paid_amount?: number | null;
          paid_at?: string | null;
          payment_status?: string;
          profile_id?: string | null;
          program_key?: string;
          starts_at?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "program_access_id_fkey";
            columns: ["id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_access_program_key_fkey";
            columns: ["program_key"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["program_key"];
          },
        ];
      };
      program_access_grants: {
        Row: {
          created_at: string;
          expires_at: string | null;
          first_accessed_at: string | null;
          granted_by: string;
          granted_by_actor: string | null;
          granted_months: number | null;
          granted_sessions: number | null;
          id: string;
          memo: string | null;
          order_id: string | null;
          order_item_id: number | null;
          paid_amount: number;
          product_id: string | null;
          product_slug: string | null;
          profile_id: string;
          program_key: string;
          revoke_reason: string | null;
          revoked_at: string | null;
          starts_at: string;
          updated_at: string;
          validity_days: number | null;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          first_accessed_at?: string | null;
          granted_by: string;
          granted_by_actor?: string | null;
          granted_months?: number | null;
          granted_sessions?: number | null;
          id?: string;
          memo?: string | null;
          order_id?: string | null;
          order_item_id?: number | null;
          paid_amount?: number;
          product_id?: string | null;
          product_slug?: string | null;
          profile_id: string;
          program_key: string;
          revoke_reason?: string | null;
          revoked_at?: string | null;
          starts_at: string;
          updated_at?: string;
          validity_days?: number | null;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          first_accessed_at?: string | null;
          granted_by?: string;
          granted_by_actor?: string | null;
          granted_months?: number | null;
          granted_sessions?: number | null;
          id?: string;
          memo?: string | null;
          order_id?: string | null;
          order_item_id?: number | null;
          paid_amount?: number;
          product_id?: string | null;
          product_slug?: string | null;
          profile_id?: string;
          program_key?: string;
          revoke_reason?: string | null;
          revoked_at?: string | null;
          starts_at?: string;
          updated_at?: string;
          validity_days?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "program_access_grants_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_access_grants_order_item_id_fkey";
            columns: ["order_item_id"];
            isOneToOne: false;
            referencedRelation: "admin_revenue_items";
            referencedColumns: ["order_item_id"];
          },
          {
            foreignKeyName: "program_access_grants_order_item_id_fkey";
            columns: ["order_item_id"];
            isOneToOne: false;
            referencedRelation: "order_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_access_grants_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_access_grants_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_access_grants_program_key_fkey";
            columns: ["program_key"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["program_key"];
          },
        ];
      };
      program_categories: {
        Row: {
          created_at: string | null;
          description: string | null;
          icon: string | null;
          icon_image_url: string | null;
          id: string;
          is_active: boolean | null;
          is_premium: boolean;
          link: string | null;
          name: string;
          sort_order: number | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          icon?: string | null;
          icon_image_url?: string | null;
          id?: string;
          is_active?: boolean | null;
          is_premium?: boolean;
          link?: string | null;
          name?: string;
          sort_order?: number | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          icon?: string | null;
          icon_image_url?: string | null;
          id?: string;
          is_active?: boolean | null;
          is_premium?: boolean;
          link?: string | null;
          name?: string;
          sort_order?: number | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      programs: {
        Row: {
          app_url: string | null;
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          name: string;
          program_key: string;
          sort_order: number | null;
          updated_at: string | null;
        };
        Insert: {
          app_url?: string | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          name: string;
          program_key: string;
          sort_order?: number | null;
          updated_at?: string | null;
        };
        Update: {
          app_url?: string | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          program_key?: string;
          sort_order?: number | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      refund_requests: {
        Row: {
          admin_memo: string | null;
          amount: number;
          approval_reject_reason: string | null;
          approval_responded_at: string | null;
          approval_status: string;
          bundle_return_amount: number | null;
          company_fault: boolean;
          completed_at: string | null;
          coupon_restored_at: string | null;
          created_at: string;
          gross_amount: number | null;
          id: number;
          needs_review: boolean;
          order_id: string;
          order_item_id: number | null;
          order_item_ids: number[] | null;
          order_name: string | null;
          parent_profile_id: string;
          policy_code: string | null;
          processed_by: string | null;
          quote: Json | null;
          reason: string | null;
          refund_account: string | null;
          refund_bank: string | null;
          refund_holder: string | null;
          refund_method: string | null;
          requested_by: string;
          status: string;
          student_profile_id: string;
          terms_version: string;
          toss_cancel: Json | null;
          user_id: string;
          within_withdrawal: boolean | null;
        };
        Insert: {
          admin_memo?: string | null;
          amount?: number;
          approval_reject_reason?: string | null;
          approval_responded_at?: string | null;
          approval_status: string;
          bundle_return_amount?: number | null;
          company_fault?: boolean;
          completed_at?: string | null;
          coupon_restored_at?: string | null;
          created_at?: string;
          gross_amount?: number | null;
          id?: never;
          needs_review?: boolean;
          order_id: string;
          order_item_id?: number | null;
          order_item_ids?: number[] | null;
          order_name?: string | null;
          parent_profile_id: string;
          policy_code?: string | null;
          processed_by?: string | null;
          quote?: Json | null;
          reason?: string | null;
          refund_account?: string | null;
          refund_bank?: string | null;
          refund_holder?: string | null;
          refund_method?: string | null;
          requested_by: string;
          status?: string;
          student_profile_id: string;
          terms_version?: string;
          toss_cancel?: Json | null;
          user_id: string;
          within_withdrawal?: boolean | null;
        };
        Update: {
          admin_memo?: string | null;
          amount?: number;
          approval_reject_reason?: string | null;
          approval_responded_at?: string | null;
          approval_status?: string;
          bundle_return_amount?: number | null;
          company_fault?: boolean;
          completed_at?: string | null;
          coupon_restored_at?: string | null;
          created_at?: string;
          gross_amount?: number | null;
          id?: never;
          needs_review?: boolean;
          order_id?: string;
          order_item_id?: number | null;
          order_item_ids?: number[] | null;
          order_name?: string | null;
          parent_profile_id?: string;
          policy_code?: string | null;
          processed_by?: string | null;
          quote?: Json | null;
          reason?: string | null;
          refund_account?: string | null;
          refund_bank?: string | null;
          refund_holder?: string | null;
          refund_method?: string | null;
          requested_by?: string;
          status?: string;
          student_profile_id?: string;
          terms_version?: string;
          toss_cancel?: Json | null;
          user_id?: string;
          within_withdrawal?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "refund_requests_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refund_requests_order_item_id_fkey";
            columns: ["order_item_id"];
            isOneToOne: false;
            referencedRelation: "admin_revenue_items";
            referencedColumns: ["order_item_id"];
          },
          {
            foreignKeyName: "refund_requests_order_item_id_fkey";
            columns: ["order_item_id"];
            isOneToOne: false;
            referencedRelation: "order_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refund_requests_parent_profile_id_fkey";
            columns: ["parent_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refund_requests_processed_by_fkey";
            columns: ["processed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refund_requests_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refund_requests_student_profile_id_fkey";
            columns: ["student_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      refunds: {
        Row: {
          class_name: string | null;
          created_at: string | null;
          id: string;
          memo: string | null;
          paid_amount: number | null;
          payer_name: string | null;
          payment_id: string | null;
          program_name: string | null;
          reason: string | null;
          refund_amount: number | null;
          requested_at: string | null;
          status: string | null;
          updated_at: string | null;
        };
        Insert: {
          class_name?: string | null;
          created_at?: string | null;
          id?: string;
          memo?: string | null;
          paid_amount?: number | null;
          payer_name?: string | null;
          payment_id?: string | null;
          program_name?: string | null;
          reason?: string | null;
          refund_amount?: number | null;
          requested_at?: string | null;
          status?: string | null;
          updated_at?: string | null;
        };
        Update: {
          class_name?: string | null;
          created_at?: string | null;
          id?: string;
          memo?: string | null;
          paid_amount?: number | null;
          payer_name?: string | null;
          payment_id?: string | null;
          program_name?: string | null;
          reason?: string | null;
          refund_amount?: number | null;
          requested_at?: string | null;
          status?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      reviews: {
        Row: {
          content: string;
          created_at: string | null;
          id: number;
          is_active: boolean | null;
          school_result: string | null;
          sort_order: number | null;
          student_name: string | null;
        };
        Insert: {
          content: string;
          created_at?: string | null;
          id?: number;
          is_active?: boolean | null;
          school_result?: string | null;
          sort_order?: number | null;
          student_name?: string | null;
        };
        Update: {
          content?: string;
          created_at?: string | null;
          id?: number;
          is_active?: boolean | null;
          school_result?: string | null;
          sort_order?: number | null;
          student_name?: string | null;
        };
        Relationships: [];
      };
      services: {
        Row: {
          created_at: string | null;
          description: string | null;
          icon: string | null;
          id: number;
          is_active: boolean | null;
          link: string | null;
          slug: string;
          sort_order: number | null;
          title: string;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: number;
          is_active?: boolean | null;
          link?: string | null;
          slug: string;
          sort_order?: number | null;
          title: string;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: number;
          is_active?: boolean | null;
          link?: string | null;
          slug?: string;
          sort_order?: number | null;
          title?: string;
        };
        Relationships: [];
      };
      special_highschool_acceptance_rates: {
        Row: {
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          rate: number;
          sort_order: number | null;
          updated_at: string | null;
          year: number;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          rate?: number;
          sort_order?: number | null;
          updated_at?: string | null;
          year: number;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          rate?: number;
          sort_order?: number | null;
          updated_at?: string | null;
          year?: number;
        };
        Relationships: [];
      };
      special_highschool_cases: {
        Row: {
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          middle_school: string;
          result_label: string;
          school_name: string;
          school_type: string;
          sort_order: number | null;
          student_name: string;
          updated_at: string | null;
          year: number;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          middle_school?: string;
          result_label?: string;
          school_name: string;
          school_type: string;
          sort_order?: number | null;
          student_name: string;
          updated_at?: string | null;
          year: number;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          middle_school?: string;
          result_label?: string;
          school_name?: string;
          school_type?: string;
          sort_order?: number | null;
          student_name?: string;
          updated_at?: string | null;
          year?: number;
        };
        Relationships: [];
      };
      sso_tickets: {
        Row: {
          created_at: string;
          expires_at: string;
          issued_at: string;
          service_key: string;
          ticket_hash: string;
          ticket_id: string;
          used_at: string | null;
          used_by_service: string | null;
          user_name: string | null;
          winning_user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          issued_at: string;
          service_key: string;
          ticket_hash: string;
          ticket_id: string;
          used_at?: string | null;
          used_by_service?: string | null;
          user_name?: string | null;
          winning_user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          issued_at?: string;
          service_key?: string;
          ticket_hash?: string;
          ticket_id?: string;
          used_at?: string | null;
          used_by_service?: string | null;
          user_name?: string | null;
          winning_user_id?: string;
        };
        Relationships: [];
      };
      student_link_codes: {
        Row: {
          code: string;
          created_at: string;
          deactivated_at: string | null;
          id: string;
          is_active: boolean;
          issued_at: string;
          student_id: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          deactivated_at?: string | null;
          id?: string;
          is_active?: boolean;
          issued_at?: string;
          student_id: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          deactivated_at?: string | null;
          id?: string;
          is_active?: boolean;
          issued_at?: string;
          student_id?: string;
        };
        Relationships: [];
      };
      tenant_code_attempts: {
        Row: {
          attempted_at: string;
          id: number;
          user_id: string;
        };
        Insert: {
          attempted_at?: string;
          id?: number;
          user_id: string;
        };
        Update: {
          attempted_at?: string;
          id?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      tenants: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          org_type: string;
          region: string;
          tier: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          org_type: string;
          region: string;
          tier: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          org_type?: string;
          region?: string;
          tier?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenants_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      terms: {
        Row: {
          audience: string;
          code: string;
          content: string | null;
          created_at: string;
          effective_from: string;
          id: string;
          is_active: boolean;
          is_required: boolean;
          profile_column: string | null;
          route: string | null;
          sort_order: number;
          title: string;
          version: string;
        };
        Insert: {
          audience?: string;
          code: string;
          content?: string | null;
          created_at?: string;
          effective_from?: string;
          id?: string;
          is_active?: boolean;
          is_required?: boolean;
          profile_column?: string | null;
          route?: string | null;
          sort_order?: number;
          title: string;
          version: string;
        };
        Update: {
          audience?: string;
          code?: string;
          content?: string | null;
          created_at?: string;
          effective_from?: string;
          id?: string;
          is_active?: boolean;
          is_required?: boolean;
          profile_column?: string | null;
          route?: string | null;
          sort_order?: number;
          title?: string;
          version?: string;
        };
        Relationships: [];
      };
      trending_departments: {
        Row: {
          created_at: string;
          department_key: string | null;
          department_name: string;
          id: string;
          is_active: boolean;
          logo_url: string | null;
          sort_order: number;
          university_key: string | null;
          university_name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          department_key?: string | null;
          department_name: string;
          id?: string;
          is_active?: boolean;
          logo_url?: string | null;
          sort_order?: number;
          university_key?: string | null;
          university_name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          department_key?: string | null;
          department_name?: string;
          id?: string;
          is_active?: boolean;
          logo_url?: string | null;
          sort_order?: number;
          university_key?: string | null;
          university_name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      university_acceptances: {
        Row: {
          count: number | null;
          created_at: string | null;
          emblem_url: string | null;
          id: string;
          is_active: boolean | null;
          name: string;
          sort_order: number | null;
          subtitle: string | null;
          track: string;
        };
        Insert: {
          count?: number | null;
          created_at?: string | null;
          emblem_url?: string | null;
          id?: string;
          is_active?: boolean | null;
          name: string;
          sort_order?: number | null;
          subtitle?: string | null;
          track?: string;
        };
        Update: {
          count?: number | null;
          created_at?: string | null;
          emblem_url?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          sort_order?: number | null;
          subtitle?: string | null;
          track?: string;
        };
        Relationships: [];
      };
      usage_status: {
        Row: {
          applicant_count: number | null;
          capacity: number | null;
          category_name: string | null;
          class_name: string | null;
          confirmed_count: number | null;
          created_at: string | null;
          id: string;
          program_name: string | null;
          remaining_count: number | null;
          status: string | null;
          term_name: string | null;
          updated_at: string | null;
        };
        Insert: {
          applicant_count?: number | null;
          capacity?: number | null;
          category_name?: string | null;
          class_name?: string | null;
          confirmed_count?: number | null;
          created_at?: string | null;
          id?: string;
          program_name?: string | null;
          remaining_count?: number | null;
          status?: string | null;
          term_name?: string | null;
          updated_at?: string | null;
        };
        Update: {
          applicant_count?: number | null;
          capacity?: number | null;
          category_name?: string | null;
          class_name?: string | null;
          confirmed_count?: number | null;
          created_at?: string | null;
          id?: string;
          program_name?: string | null;
          remaining_count?: number | null;
          status?: string | null;
          term_name?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      user_term_agreements: {
        Row: {
          agreed: boolean;
          agreed_at: string;
          created_at: string;
          id: string;
          term_id: string;
          user_id: string;
        };
        Insert: {
          agreed: boolean;
          agreed_at?: string;
          created_at?: string;
          id?: string;
          term_id: string;
          user_id: string;
        };
        Update: {
          agreed?: boolean;
          agreed_at?: string;
          created_at?: string;
          id?: string;
          term_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_term_agreements_term_id_fkey";
            columns: ["term_id"];
            isOneToOne: false;
            referencedRelation: "terms";
            referencedColumns: ["id"];
          },
        ];
      };
      winning_assessment_knowledge_items: {
        Row: {
          career_field: string | null;
          content: string;
          created_at: string | null;
          embedded_at: string | null;
          embedding: string | null;
          embedding_error: string | null;
          embedding_model: string | null;
          embedding_status: string | null;
          grade: string;
          id: string;
          is_active: boolean | null;
          keywords: string | null;
          knowledge_type: string;
          memo: string | null;
          rag_use: boolean | null;
          search_text: string | null;
          source: string | null;
          source_link: string | null;
          subject: string;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          career_field?: string | null;
          content: string;
          created_at?: string | null;
          embedded_at?: string | null;
          embedding?: string | null;
          embedding_error?: string | null;
          embedding_model?: string | null;
          embedding_status?: string | null;
          grade: string;
          id?: string;
          is_active?: boolean | null;
          keywords?: string | null;
          knowledge_type: string;
          memo?: string | null;
          rag_use?: boolean | null;
          search_text?: string | null;
          source?: string | null;
          source_link?: string | null;
          subject: string;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          career_field?: string | null;
          content?: string;
          created_at?: string | null;
          embedded_at?: string | null;
          embedding?: string | null;
          embedding_error?: string | null;
          embedding_model?: string | null;
          embedding_status?: string | null;
          grade?: string;
          id?: string;
          is_active?: boolean | null;
          keywords?: string | null;
          knowledge_type?: string;
          memo?: string | null;
          rag_use?: boolean | null;
          search_text?: string | null;
          source?: string | null;
          source_link?: string | null;
          subject?: string;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      winning_base_data: {
        Row: {
          content: string | null;
          created_at: string | null;
          data_type: string | null;
          id: string;
          is_active: boolean | null;
          memo: string | null;
          sort_order: number | null;
          source: string | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          content?: string | null;
          created_at?: string | null;
          data_type?: string | null;
          id?: string;
          is_active?: boolean | null;
          memo?: string | null;
          sort_order?: number | null;
          source?: string | null;
          title?: string;
          updated_at?: string | null;
        };
        Update: {
          content?: string | null;
          created_at?: string | null;
          data_type?: string | null;
          id?: string;
          is_active?: boolean | null;
          memo?: string | null;
          sort_order?: number | null;
          source?: string | null;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      winning_db_inputs: {
        Row: {
          created_at: string | null;
          id: string;
          input_type: string | null;
          memo: string | null;
          parsed_data: Json | null;
          raw_data: string | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          input_type?: string | null;
          memo?: string | null;
          parsed_data?: Json | null;
          raw_data?: string | null;
          title?: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          input_type?: string | null;
          memo?: string | null;
          parsed_data?: Json | null;
          raw_data?: string | null;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      admin_access_log_entries: {
        Row: {
          action: string | null;
          actor_email: string | null;
          actor_name: string | null;
          created_at: string | null;
          id: string | null;
          reason: string | null;
          resource_key: string | null;
          row_count: number | null;
          target_id: string | null;
        };
        Relationships: [];
      };
      admin_enrollment_entries: {
        Row: {
          approval_no: string | null;
          category_name: string | null;
          class_name: string | null;
          created_at: string | null;
          discount_amount: number | null;
          grade: string | null;
          guardian_name: string | null;
          id: string | null;
          memo: string | null;
          order_id: string | null;
          paid_amount: number | null;
          payment_method: string | null;
          payment_status: string | null;
          phone: string | null;
          price: number | null;
          program_name: string | null;
          school_name: string | null;
          source: string | null;
          student_name: string | null;
          term_name: string | null;
        };
        Relationships: [];
      };
      admin_member_directory: {
        Row: {
          activated_at: string | null;
          department: string | null;
          invited_at: string | null;
          invited_by: string | null;
          joined_at: string | null;
          member_email: string | null;
          member_name: string | null;
          member_phone: string | null;
          profile_id: string | null;
          role_id: string | null;
          role_is_super: boolean | null;
          role_name: string | null;
          status: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_members_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_members_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_members_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "admin_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_refund_ledger: {
        Row: {
          admin_memo: string | null;
          completed_at: string | null;
          id: number | null;
          order_id: string | null;
          org_code: string | null;
          paid_amount: number | null;
          processed_by_name: string | null;
          program_name: string | null;
          reason: string | null;
          refund_amount: number | null;
          refund_method: string | null;
          status: string | null;
          student_name: string | null;
          tenant_name: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "refund_requests_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_revenue_items: {
        Row: {
          discount_amount: number | null;
          item_name: string | null;
          list_amount: number | null;
          method: string | null;
          net_amount: number | null;
          order_id: string | null;
          order_item_id: number | null;
          order_status: string | null;
          paid_amount: number | null;
          paid_at: string | null;
          payer_email: string | null;
          payer_name: string | null;
          payer_profile_id: string | null;
          quantity: number | null;
          refunded_amount: number | null;
          revenue_status: string | null;
          service_key: string | null;
          student_name: string | null;
          student_profile_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_student_profile_id_fkey";
            columns: ["student_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      admission_result_department_index: {
        Row: {
          department_key: string | null;
          department_name: string | null;
          tracks: string[] | null;
          university_key: string | null;
        };
        Relationships: [];
      };
      admission_result_university_index: {
        Row: {
          dept_count: number | null;
          university_key: string | null;
          university_name: string | null;
        };
        Relationships: [];
      };
      admission_university_resource_index: {
        Row: {
          admission_year: number | null;
          campus: string | null;
          detail_status: string | null;
          has_exam_schedule: boolean | null;
          has_exam_schedule_html: boolean | null;
          has_exam_schedule_json: boolean | null;
          has_minimum_requirements: boolean | null;
          has_minimum_requirements_html: boolean | null;
          has_minimum_requirements_json: boolean | null;
          has_previous_year_changes: boolean | null;
          has_previous_year_changes_html: boolean | null;
          has_previous_year_changes_json: boolean | null;
          has_recruitment_quota: boolean | null;
          has_recruitment_quota_json: boolean | null;
          has_recruitment_result_html: boolean | null;
          has_school_record_method: boolean | null;
          has_school_record_method_html: boolean | null;
          has_school_record_method_json: boolean | null;
          has_selection_method: boolean | null;
          has_selection_method_html: boolean | null;
          has_selection_method_json: boolean | null;
          id: string | null;
          is_active: boolean | null;
          jungsi_guideline_url: string | null;
          matched_hwp_name: string | null;
          matched_text_name: string | null;
          official_source_url: string | null;
          region: string | null;
          university_key: string | null;
          university_name: string | null;
        };
        Insert: {
          admission_year?: number | null;
          campus?: string | null;
          detail_status?: string | null;
          has_exam_schedule?: never;
          has_exam_schedule_html?: never;
          has_exam_schedule_json?: never;
          has_minimum_requirements?: never;
          has_minimum_requirements_html?: never;
          has_minimum_requirements_json?: never;
          has_previous_year_changes?: never;
          has_previous_year_changes_html?: never;
          has_previous_year_changes_json?: never;
          has_recruitment_quota?: never;
          has_recruitment_quota_json?: never;
          has_recruitment_result_html?: never;
          has_school_record_method?: never;
          has_school_record_method_html?: never;
          has_school_record_method_json?: never;
          has_selection_method?: never;
          has_selection_method_html?: never;
          has_selection_method_json?: never;
          id?: string | null;
          is_active?: boolean | null;
          jungsi_guideline_url?: string | null;
          matched_hwp_name?: string | null;
          matched_text_name?: string | null;
          official_source_url?: string | null;
          region?: string | null;
          university_key?: string | null;
          university_name?: string | null;
        };
        Update: {
          admission_year?: number | null;
          campus?: string | null;
          detail_status?: string | null;
          has_exam_schedule?: never;
          has_exam_schedule_html?: never;
          has_exam_schedule_json?: never;
          has_minimum_requirements?: never;
          has_minimum_requirements_html?: never;
          has_minimum_requirements_json?: never;
          has_previous_year_changes?: never;
          has_previous_year_changes_html?: never;
          has_previous_year_changes_json?: never;
          has_recruitment_quota?: never;
          has_recruitment_quota_json?: never;
          has_recruitment_result_html?: never;
          has_school_record_method?: never;
          has_school_record_method_html?: never;
          has_school_record_method_json?: never;
          has_selection_method?: never;
          has_selection_method_html?: never;
          has_selection_method_json?: never;
          id?: string | null;
          is_active?: boolean | null;
          jungsi_guideline_url?: string | null;
          matched_hwp_name?: string | null;
          matched_text_name?: string | null;
          official_source_url?: string | null;
          region?: string | null;
          university_key?: string | null;
          university_name?: string | null;
        };
        Relationships: [];
      };
      coupon_wallet_state: {
        Row: {
          coupon_id: string | null;
          discount_amount: number | null;
          grant_type: string | null;
          grant_valid_until: string | null;
          granted_at: string | null;
          granted_by: string | null;
          is_active: boolean | null;
          max_uses_per_user: number | null;
          min_amount: number | null;
          remaining_count: number | null;
          revoked_at: string | null;
          slug: string | null;
          title: string | null;
          used_count: number | null;
          user_id: string | null;
          valid_until: string | null;
        };
        Relationships: [];
      };
      goal_student_state: {
        Row: {
          base_ideal_jungsi: number | null;
          base_ideal_susi: number | null;
          base_min_jungsi: number | null;
          base_min_susi: number | null;
          cum_ideal_jungsi: number | null;
          cum_ideal_susi: number | null;
          cum_min_jungsi: number | null;
          cum_min_susi: number | null;
          ideal_jungsi: number | null;
          ideal_susi: number | null;
          last_record_date: string | null;
          min_jungsi: number | null;
          min_susi: number | null;
          onboarded_at: string | null;
          profile_id: string | null;
          record_count: number | null;
          status: string | null;
        };
        Relationships: [];
      };
      goal_university_options: {
        Row: {
          department_key: string | null;
          department_name: string | null;
          has_jungsi: boolean | null;
          has_normal: boolean | null;
          has_special: boolean | null;
          university_key: string | null;
          university_name: string | null;
        };
        Relationships: [];
      };
      v_performance_saved_reports: {
        Row: {
          career_goal: string | null;
          design_report_id: string | null;
          evaluation_report_id: string | null;
          final_report_id: string | null;
          grade_label: string | null;
          has_design: boolean | null;
          has_evaluation: boolean | null;
          has_final: boolean | null;
          session_id: string | null;
          subject: string | null;
          subject_group: string | null;
          topic_title: string | null;
          updated_at: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      check_email_signup_state: { Args: { p_email: string }; Returns: string };
      commit_performance_design_report: {
        Args: {
          p_model?: string;
          p_profile_id: string;
          p_prompt_version?: string;
          p_sections: Json;
          p_session_id: string;
          p_topic_id: string;
        };
        Returns: Json;
      };
      commit_performance_evaluation_report: {
        Args: {
          p_model?: string;
          p_profile_id: string;
          p_prompt_version?: string;
          p_score?: number;
          p_sections: Json;
          p_session_id: string;
          p_submission_id: string;
          p_summary?: string;
        };
        Returns: Json;
      };
      complete_signup_profile: {
        Args: {
          p_ads_agreed: boolean;
          p_birth_date?: string;
          p_email: string;
          p_gender?: string;
          p_guardian_consent?: boolean;
          p_guardian_phone?: string;
          p_identity_request_id?: string;
          p_identity_required_agreed: boolean;
          p_marketing_agreed: boolean;
          p_member_type: string;
          p_name: string;
          p_org_code?: string;
          p_phone: string;
          p_privacy_optional_agreed: boolean;
          p_privacy_required_agreed: boolean;
          p_region: string;
          p_school_name: string;
          p_school_type: string;
          p_terms_service_agreed: boolean;
          p_username: string;
        };
        Returns: Json;
      };
      consume_diagnosis_attempt: {
        Args: { p_attempt_id: string; p_profile_id: string; p_reason?: string };
        Returns: Json;
      };
      consume_performance_credit: {
        Args: { p_profile_id: string; p_reason?: string; p_session_id: string };
        Returns: Json;
      };
      finalize_performance_submission: {
        Args: {
          p_profile_id: string;
          p_reason: string;
          p_sections: Json;
          p_session_id: string;
          p_submission_id: string;
        };
        Returns: Json;
      };
      fn_activate_admin_member: {
        Args: never;
        Returns: {
          activated_at: string | null;
          created_at: string;
          department: string | null;
          invited_at: string;
          invited_by: string | null;
          profile_id: string;
          role_id: string | null;
          status: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "admin_members";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      fn_add_months_kst: {
        Args: { p_months: number; p_ts: string };
        Returns: string;
      };
      fn_admin_can: {
        Args: { p_need?: string; p_resource: string };
        Returns: boolean;
      };
      fn_admin_effective_permissions: {
        Args: { p_profile_id: string };
        Returns: {
          level: string;
          resource_key: string;
        }[];
      };
      fn_admin_requote_refund: {
        Args: { p_company_fault: boolean; p_refund_request_id: number };
        Returns: {
          admin_memo: string | null;
          amount: number;
          approval_reject_reason: string | null;
          approval_responded_at: string | null;
          approval_status: string;
          bundle_return_amount: number | null;
          company_fault: boolean;
          completed_at: string | null;
          coupon_restored_at: string | null;
          created_at: string;
          gross_amount: number | null;
          id: number;
          needs_review: boolean;
          order_id: string;
          order_item_id: number | null;
          order_item_ids: number[] | null;
          order_name: string | null;
          parent_profile_id: string;
          policy_code: string | null;
          processed_by: string | null;
          quote: Json | null;
          reason: string | null;
          refund_account: string | null;
          refund_bank: string | null;
          refund_holder: string | null;
          refund_method: string | null;
          requested_by: string;
          status: string;
          student_profile_id: string;
          terms_version: string;
          toss_cancel: Json | null;
          user_id: string;
          within_withdrawal: boolean | null;
        };
        SetofOptions: {
          from: "*";
          to: "refund_requests";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      fn_admin_set_profile_tenant: {
        Args: { p_profile_id: string; p_tenant_id: string };
        Returns: undefined;
      };
      fn_agree_payment_terms: { Args: never; Returns: Json };
      fn_complete_refund: {
        Args: { p_admin_memo?: string; p_refund_request_id: number };
        Returns: {
          admin_memo: string | null;
          amount: number;
          approval_reject_reason: string | null;
          approval_responded_at: string | null;
          approval_status: string;
          bundle_return_amount: number | null;
          company_fault: boolean;
          completed_at: string | null;
          coupon_restored_at: string | null;
          created_at: string;
          gross_amount: number | null;
          id: number;
          needs_review: boolean;
          order_id: string;
          order_item_id: number | null;
          order_item_ids: number[] | null;
          order_name: string | null;
          parent_profile_id: string;
          policy_code: string | null;
          processed_by: string | null;
          quote: Json | null;
          reason: string | null;
          refund_account: string | null;
          refund_bank: string | null;
          refund_holder: string | null;
          refund_method: string | null;
          requested_by: string;
          status: string;
          student_profile_id: string;
          terms_version: string;
          toss_cancel: Json | null;
          user_id: string;
          within_withdrawal: boolean | null;
        };
        SetofOptions: {
          from: "*";
          to: "refund_requests";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      fn_coupon_by_code:
        | {
            Args: {
              p_code: string;
              p_student_profile_id?: string;
              p_subtotal?: number;
            };
            Returns: {
              discount_amount: number;
              eligible: boolean;
              id: string;
              is_active: boolean;
              min_amount: number;
              owner_is_student: boolean;
              owner_profile_id: string;
              reason: string;
              title: string;
              valid_until: string;
            }[];
          }
        | {
            Args: {
              p_code: string;
              p_order_id?: string;
              p_student_profile_id?: string;
              p_subtotal?: number;
            };
            Returns: {
              discount_amount: number;
              eligible: boolean;
              id: string;
              is_active: boolean;
              min_amount: number;
              owner_is_student: boolean;
              owner_profile_id: string;
              reason: string;
              title: string;
              valid_until: string;
            }[];
          };
      fn_coupon_global_redeemed: {
        Args: {
          p_at?: string;
          p_coupon_id: string;
          p_exclude_order_id?: string;
        };
        Returns: boolean;
      };
      fn_coupon_grant_valid_months: { Args: never; Returns: number };
      fn_coupon_grant_valid_until: {
        Args: { p_coupon_id: string; p_user_id: string };
        Returns: string;
      };
      fn_coupon_is_granted: {
        Args: { p_coupon_id: string; p_user_id: string };
        Returns: boolean;
      };
      fn_coupon_is_redeemed: {
        Args: {
          p_at?: string;
          p_coupon_id: string;
          p_exclude_order_id?: string;
          p_user_id: string;
        };
        Returns: boolean;
      };
      fn_coupon_org_matches: {
        Args: {
          p_coupon_org_code: string;
          p_parent: string;
          p_student: string;
        };
        Returns: boolean;
      };
      fn_coupon_pending_hold_minutes: { Args: never; Returns: number };
      fn_create_tenant: {
        Args: {
          p_name: string;
          p_org_type: string;
          p_region: string;
          p_tier: string;
        };
        Returns: {
          code: string;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          org_type: string;
          region: string;
          tier: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "tenants";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      fn_delete_account: { Args: { p_user_id: string }; Returns: string };
      fn_finalize_paid_order: {
        Args: {
          p_confirm_amount?: number;
          p_method: string;
          p_order_id: string;
          p_paid_at: string;
          p_payment_key: string;
          p_raw: Json;
          p_require_pending_or_failed?: boolean;
          p_restore_revoked?: boolean;
          p_status: string;
        };
        Returns: Json;
      };
      fn_generate_tenant_code: { Args: never; Returns: string };
      fn_goal_reset_student: {
        Args: { p_profile_id: string };
        Returns: undefined;
      };
      fn_grant_coupon: {
        Args: { p_coupon_id: string; p_user_id: string };
        Returns: {
          coupon_id: string;
          granted_at: string;
          granted_by: string;
          id: number;
          revoke_reason: string | null;
          revoked_at: string | null;
          user_id: string;
          valid_until: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "coupon_grants";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      fn_grant_program_access_for_order: {
        Args: {
          p_order_id: string;
          p_paid_at?: string;
          p_restore_revoked?: boolean;
          p_user_id: string;
        };
        Returns: Json;
      };
      fn_grant_signup_coupons_for_user: {
        Args: { p_user_id: string };
        Returns: number;
      };
      fn_is_active_admin: { Args: { p_profile_id?: string }; Returns: boolean };
      fn_is_linked_pair: {
        Args: { p_a: string; p_b: string };
        Returns: boolean;
      };
      fn_is_super_admin: { Args: { p_profile_id?: string }; Returns: boolean };
      fn_kst_day_start: { Args: { p_ts: string }; Returns: string };
      fn_mark_program_entry: {
        Args: { p_program_key: string };
        Returns: undefined;
      };
      fn_matched_org_codes: {
        Args: { p_student_profile_id?: string };
        Returns: string[];
      };
      fn_matched_tenant_ids: {
        Args: { p_student_profile_id?: string };
        Returns: string[];
      };
      fn_my_tenant: {
        Args: never;
        Returns: {
          id: string;
          name: string;
        }[];
      };
      fn_normalize_tenant_code: { Args: { p: string }; Returns: string };
      fn_order_consumption_state: {
        Args: { p_order_id: string };
        Returns: {
          consumed: boolean;
          consumed_period: string;
          consumed_sessions: string;
        }[];
      };
      fn_parent_children: {
        Args: never;
        Returns: {
          link_id: string;
          link_status: string;
          linked_at: string;
          school_name: string;
          school_type: string;
          services: Json;
          student_name: string;
          student_profile_id: string;
        }[];
      };
      fn_parent_create_enrollment: {
        Args: { p_items: Json; p_original_order_id: string };
        Returns: {
          amount: number;
          discount_amount: number;
          order_id: string;
        }[];
      };
      fn_product_org_matches: {
        Args: { p_org_code: string; p_parent: string; p_student: string };
        Returns: boolean;
      };
      fn_program_access_grants_summary: {
        Args: { p_profile_id: string; p_program_key: string };
        Returns: {
          expires_at: string;
          live_count: number;
          quota_total: number;
          quota_used: number;
          unlimited_period: boolean;
          unlimited_sessions: boolean;
        }[];
      };
      fn_program_access_state: {
        Args: { p_profile_id: string; p_program_keys: string[] };
        Returns: {
          allowed: boolean;
          expires_at: string;
          program_key: string;
          quota_total: number;
          quota_used: number;
          reason: string;
          unlimited_period: boolean;
          unlimited_sessions: boolean;
        }[];
      };
      fn_refund_completed_amount: {
        Args: { p_order_id: string };
        Returns: number;
      };
      fn_refund_quote: {
        Args: {
          p_at?: string;
          p_company_fault?: boolean;
          p_order_id: string;
          p_order_item_ids?: number[];
        };
        Returns: {
          bundle_return_amount: number;
          company_fault: boolean;
          coupon_restore: boolean;
          fee_amount: number;
          gross_amount: number;
          lines: Json;
          needs_review: boolean;
          order_id: string;
          policy_code: string;
          refund_amount: number;
          scope: string;
          started: boolean;
          terms_version: string;
          within_withdrawal: boolean;
        }[];
      };
      fn_request_enrollment: {
        Args: {
          p_customer_email: string;
          p_items: Json;
          p_list_amount: number;
          p_order_id: string;
          p_order_name: string;
          p_parent_profile_id: string;
          p_student_profile_id: string;
          p_subtotal: number;
        };
        Returns: {
          amount: number;
          discount_amount: number;
          order_id: string;
        }[];
      };
      fn_request_refund: {
        Args: {
          p_order_id: string;
          p_order_item_ids?: number[];
          p_reason: string;
          p_refund_account?: string;
          p_refund_bank?: string;
          p_refund_holder?: string;
        };
        Returns: {
          admin_memo: string | null;
          amount: number;
          approval_reject_reason: string | null;
          approval_responded_at: string | null;
          approval_status: string;
          bundle_return_amount: number | null;
          company_fault: boolean;
          completed_at: string | null;
          coupon_restored_at: string | null;
          created_at: string;
          gross_amount: number | null;
          id: number;
          needs_review: boolean;
          order_id: string;
          order_item_id: number | null;
          order_item_ids: number[] | null;
          order_name: string | null;
          parent_profile_id: string;
          policy_code: string | null;
          processed_by: string | null;
          quote: Json | null;
          reason: string | null;
          refund_account: string | null;
          refund_bank: string | null;
          refund_holder: string | null;
          refund_method: string | null;
          requested_by: string;
          status: string;
          student_profile_id: string;
          terms_version: string;
          toss_cancel: Json | null;
          user_id: string;
          within_withdrawal: boolean | null;
        };
        SetofOptions: {
          from: "*";
          to: "refund_requests";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      fn_resolve_tenant_code: { Args: { p_code: string }; Returns: string };
      fn_respond_enrollment: {
        Args: {
          p_approve: boolean;
          p_coupon_ids?: string[];
          p_order_id: string;
          p_reject_reason?: string;
        };
        Returns: {
          amount: number;
          applied_coupon_ids: string[];
          approval_status: string;
          discount_amount: number;
          order_id: string;
          skipped_coupon_ids: string[];
          status: string;
        }[];
      };
      fn_respond_refund: {
        Args: {
          p_approve: boolean;
          p_refund_account?: string;
          p_refund_bank?: string;
          p_refund_holder?: string;
          p_refund_request_id: number;
          p_reject_reason?: string;
        };
        Returns: {
          admin_memo: string | null;
          amount: number;
          approval_reject_reason: string | null;
          approval_responded_at: string | null;
          approval_status: string;
          bundle_return_amount: number | null;
          company_fault: boolean;
          completed_at: string | null;
          coupon_restored_at: string | null;
          created_at: string;
          gross_amount: number | null;
          id: number;
          needs_review: boolean;
          order_id: string;
          order_item_id: number | null;
          order_item_ids: number[] | null;
          order_name: string | null;
          parent_profile_id: string;
          policy_code: string | null;
          processed_by: string | null;
          quote: Json | null;
          reason: string | null;
          refund_account: string | null;
          refund_bank: string | null;
          refund_holder: string | null;
          refund_method: string | null;
          requested_by: string;
          status: string;
          student_profile_id: string;
          terms_version: string;
          toss_cancel: Json | null;
          user_id: string;
          within_withdrawal: boolean | null;
        };
        SetofOptions: {
          from: "*";
          to: "refund_requests";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      fn_revalidate_order_coupons: {
        Args: { p_order_id: string };
        Returns: {
          coupon_id: string;
          ok: boolean;
          reason: string;
        }[];
      };
      fn_revoke_coupon_grant: {
        Args: { p_grant_id: number; p_reason?: string };
        Returns: {
          coupon_id: string;
          granted_at: string;
          granted_by: string;
          id: number;
          revoke_reason: string | null;
          revoked_at: string | null;
          user_id: string;
          valid_until: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "coupon_grants";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      fn_revoke_program_access_for_order: {
        Args: {
          p_order_id: string;
          p_order_item_ids?: number[];
          p_payment_status?: string;
          p_reason?: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      fn_set_my_tenant: {
        Args: { p_code: string };
        Returns: {
          name: string;
          tenant_id: string;
        }[];
      };
      fn_student_parent: {
        Args: never;
        Returns: {
          link_id: string;
          link_status: string;
          linked_at: string;
          parent_name: string;
          parent_profile_id: string;
        }[];
      };
      fn_sync_program_access_cache: {
        Args: {
          p_empty_payment_status?: string;
          p_profile_id: string;
          p_program_key: string;
        };
        Returns: Json;
      };
      fn_tenant_matches: {
        Args: { p_parent: string; p_student: string; p_tenant_id: string };
        Returns: boolean;
      };
      fn_usable_coupons:
        | {
            Args: { p_student_profile_id?: string; p_subtotal?: number };
            Returns: {
              discount_amount: number;
              eligible: boolean;
              id: string;
              is_active: boolean;
              min_amount: number;
              owner_is_student: boolean;
              owner_profile_id: string;
              reason: string;
              title: string;
              valid_until: string;
            }[];
          }
        | {
            Args: {
              p_order_id?: string;
              p_student_profile_id?: string;
              p_subtotal?: number;
            };
            Returns: {
              discount_amount: number;
              eligible: boolean;
              id: string;
              is_active: boolean;
              min_amount: number;
              owner_is_student: boolean;
              owner_profile_id: string;
              reason: string;
              title: string;
              valid_until: string;
            }[];
          };
      fn_void_coupon_redemption: {
        Args: { p_reason?: string; p_redemption_id: number };
        Returns: {
          coupon_id: string;
          created_at: string;
          discount_amount: number;
          id: number;
          order_id: string;
          user_id: string | null;
          void_reason: string | null;
          voided_at: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "coupon_redemptions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      generate_link_code_string: { Args: never; Returns: string };
      increment_board_view: {
        Args: { p_id: string; p_source: string };
        Returns: number;
      };
      is_admin: { Args: never; Returns: boolean };
      is_email_available: { Args: { check_email: string }; Returns: boolean };
      is_username_available: {
        Args: { check_username: string };
        Returns: boolean;
      };
      is_winning_admin: { Args: never; Returns: boolean };
      issue_student_link_code: {
        Args: { p_student_id: string };
        Returns: string;
      };
      match_student_performance_sessions: {
        Args: {
          filter_profile_id: string;
          match_count?: number;
          match_threshold?: number;
          query_embedding: string;
        };
        Returns: {
          career_goal: string;
          created_at: string;
          grade_label: string;
          session_id: string;
          similarity: number;
          subject: string;
          subject_group: string;
          summary_text: string;
          topic_title: string;
        }[];
      };
      match_winning_suhaeng_all_subjects: {
        Args: {
          filter_grade?: string;
          filter_knowledge_type: string;
          filter_subject?: string;
          match_count?: number;
          match_threshold?: number;
          query_embedding: string;
        };
        Returns: {
          career_field: string;
          content: string;
          grade: string;
          id: string;
          knowledge_type: string;
          memo: string;
          similarity: number;
          source: string;
          source_link: string;
          subject: string;
          title: string;
        }[];
      };
      performance_owns_session: {
        Args: { p_session_id: string };
        Returns: boolean;
      };
      reissue_link_code: { Args: never; Returns: Json };
      request_parent_link: { Args: { p_code: string }; Returns: Json };
      respond_parent_link: {
        Args: { p_approve: boolean; p_link_id: string };
        Returns: Json;
      };
      revoke_parent_link: { Args: { p_link_id: string }; Returns: Json };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
