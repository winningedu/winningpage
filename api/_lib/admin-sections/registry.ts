// 서버 섹션 레지스트리. 범용 엔진 섹션 35개의 테이블, 필터, 정렬, 쓰기 허용 컬럼을 서버가 따로 들고 있다.
// 브라우저 config(src/pages/admin/configs)는 React 컴포넌트를 끌어와 api/ 가 import 할 수 없어서다.
// 둘이 어긋나면 registry.drift.test.ts 가 잡는다. 사이트별로 달라지는 값은 지금 없다(드리프트 테스트가 사이트마다 확인).
// 메뉴 권한 키는 섹션 키 그대로다(별칭, 최고 관리자 전용 키는 adminPermission.ts 가 알아서 푼다).

import type { Database } from "../../../src/types/database.types.js";

type Tables = Database["public"]["Tables"];
type Views = Database["public"]["Views"];

/** 화면의 PAGE_SIZE 와 같아야 한다(드리프트 테스트). */
export const SECTION_PAGE_SIZE = 10;
/** 화면의 EXPORT_CHUNK 와 같아야 한다(드리프트 테스트). */
export const SECTION_EXPORT_CHUNK = 1000;

/** 클라이언트가 보내도 서버가 받지 않는 컬럼(DB 가 채운다). */
export const PROTECTED_COLUMNS = ["id", "created_at", "updated_at"] as const;

export interface SectionEntry {
  table: string;
  /** 목록만 조인 뷰에서 읽는 섹션. 쓰기는 table 을 쓴다. */
  listTable?: string;
  fixedCategories?: readonly string[];
  fixedValues?: Readonly<Record<string, string>>;
  searchColumns?: readonly string[];
  order?: string;
  orderBy?: readonly (readonly [string, boolean])[];
  serverPaginate: boolean;
  readOnly: boolean;
  noCreate: boolean;
  knowledgeReview: boolean;
  /** 메타 편집 모달(saveAdmissionMeta)을 쓰는 섹션. */
  meta: boolean;
  /** 조인 뷰에만 있는 파생 컬럼. 쓰기 전에 떼어 낸다. */
  listOnlyColumns: readonly string[];
  /** config.fields 에 view_count 가 있으면 조회수를 직접 고칠 수 있다. 아니면 조용히 뗀다. */
  viewCountEditable: boolean;
  /** config.fields 에 sort_order 가 있으면 지정한 자리로 꽂도록 뒤를 민다. */
  shiftSortOrder: boolean;
  /** 서버가 받는 컬럼. 테이블 Update 키에서 보호 컬럼과 listOnlyColumns 를 뺀 것(읽기 전용 섹션은 비어 있다). */
  writable: readonly string[];
}

// 뷰는 쓸 수 없으므로 writable 이 비어야 한다(never).
type WritableColumn<T> = T extends keyof Tables
  ? keyof Tables[T]["Update"] & string
  : never;

type SectionInput<T extends keyof Tables | keyof Views> = {
  table: T;
  listTable?: string;
  fixedCategories?: readonly string[];
  fixedValues?: Readonly<Record<string, string>>;
  searchColumns?: readonly string[];
  order?: string;
  orderBy?: readonly (readonly [string, boolean])[];
  serverPaginate?: boolean;
  readOnly?: boolean;
  noCreate?: boolean;
  knowledgeReview?: boolean;
  meta?: boolean;
  listOnlyColumns?: readonly string[];
  viewCountEditable?: boolean;
  shiftSortOrder?: boolean;
  // 없는 컬럼 이름을 적으면 tsc 가 막는다.
  writable: readonly WritableColumn<T>[];
};

function section<T extends keyof Tables | keyof Views>(
  input: SectionInput<T>,
): SectionEntry {
  return {
    ...input,
    serverPaginate: input.serverPaginate ?? false,
    readOnly: input.readOnly ?? false,
    noCreate: input.noCreate ?? false,
    knowledgeReview: input.knowledgeReview ?? false,
    meta: input.meta ?? false,
    listOnlyColumns: input.listOnlyColumns ?? [],
    viewCountEditable: input.viewCountEditable ?? false,
    shiftSortOrder: input.shiftSortOrder ?? false,
  };
}

export const SECTIONS = {
  specialHighschool: section({
    table: "special_highschool_cases",
    order: "sort_order",
    shiftSortOrder: true,
    writable: [
      "is_active",
      "middle_school",
      "result_label",
      "school_name",
      "school_type",
      "sort_order",
      "student_name",
      "year",
    ],
  }),
  specialHighschoolRates: section({
    table: "special_highschool_acceptance_rates",
    order: "sort_order",
    shiftSortOrder: true,
    writable: ["is_active", "rate", "sort_order", "year"],
  }),
  acceptanceRates: section({
    table: "admission_acceptance_rates",
    order: "sort_order",
    shiftSortOrder: true,
    writable: ["is_active", "rate", "sort_order", "year"],
  }),
  admissionCaseLogos: section({
    table: "admission_case_logos",
    order: "sort_order",
    shiftSortOrder: true,
    writable: [
      "display_height_rem",
      "is_active",
      "logo_url",
      "name",
      "opacity",
      "row_no",
      "sort_order",
    ],
  }),
  admissionGuidelines: section({
    table: "admission_university_resources",
    order: "university_name",
    meta: true,
    writable: [
      "admission_year",
      "campus",
      "detail_status",
      "exam_schedule",
      "exam_schedule_html",
      "exam_schedule_json",
      "is_active",
      "jungsi_guideline_url",
      "matched_hwp_name",
      "matched_text_name",
      "memo",
      "minimum_requirements",
      "minimum_requirements_html",
      "minimum_requirements_json",
      "official_source_url",
      "previous_year_changes",
      "previous_year_changes_html",
      "previous_year_changes_json",
      "recruitment_quota",
      "recruitment_quota_json",
      "recruitment_result_html",
      "region",
      "school_record_method",
      "school_record_method_html",
      "school_record_method_json",
      "selection_method",
      "selection_method_html",
      "selection_method_json",
      "source_name",
      "source_version",
      "university_key",
      "university_name",
    ],
  }),
  admissionUniversities: section({
    table: "admission_universities",
    order: "sort_order",
    shiftSortOrder: true,
    writable: ["is_active", "name", "region", "sort_order", "special_group"],
  }),
  admissionResults: section({
    table: "admission_results",
    searchColumns: ["university_name", "department_name", "admission_track"],
    order: "result_year",
    orderBy: [
      ["result_year", false],
      ["id", false],
    ],
    serverPaginate: true,
    writable: [
      "admission_track",
      "competition_rate",
      "converted_score",
      "department_key",
      "department_name",
      "grade_50",
      "grade_70",
      "grade_85",
      "grade_90",
      "grade_avg",
      "grade_avg10",
      "grade_first_avg",
      "grade_min",
      "grade_min10",
      "is_active",
      "main_track",
      "note",
      "percentile",
      "quota",
      "result_year",
      "screening_category",
      "source_row",
      "source_sheet",
      "subject_reflection",
      "university_key",
      "university_name",
      "variant_seq",
      "waitlist_rank",
    ],
  }),
  trendingDepartments: section({
    table: "trending_departments",
    order: "sort_order",
    shiftSortOrder: true,
    writable: [
      "department_key",
      "department_name",
      "is_active",
      "logo_url",
      "sort_order",
      "university_key",
      "university_name",
    ],
  }),
  admissionSusiJungsi: section({
    table: "admission_posts",
    fixedCategories: ["susi", "jungsi"],
    order: "sort_order",
    shiftSortOrder: true,
    writable: [
      "attachments",
      "category",
      "content",
      "content_json",
      "file_name",
      "file_url",
      "image_url",
      "image_urls",
      "is_active",
      "is_pinned",
      "show_on_home",
      "sort_order",
      "title",
    ],
  }),
  notices: section({
    table: "notices",
    order: "sort_order",
    orderBy: [
      ["is_pinned", false],
      ["sort_order", true],
      ["created_at", false],
    ],
    viewCountEditable: true,
    shiftSortOrder: true,
    writable: [
      "attachments",
      "category",
      "content",
      "file_name",
      "file_url",
      "image_url",
      "image_urls",
      "is_active",
      "is_pinned",
      "sort_order",
      "title",
      "view_count",
    ],
  }),
  companyNews: section({
    table: "company_news",
    order: "sort_order",
    orderBy: [
      ["is_pinned", false],
      ["sort_order", true],
      ["created_at", false],
    ],
    viewCountEditable: true,
    shiftSortOrder: true,
    writable: [
      "attachments",
      "category",
      "content",
      "file_name",
      "file_url",
      "image_url",
      "image_urls",
      "is_active",
      "is_pinned",
      "sort_order",
      "title",
      "view_count",
    ],
  }),
  galleries: section({
    table: "galleries",
    order: "created_at",
    viewCountEditable: true,
    writable: [
      "category",
      "content",
      "content_json",
      "image_url",
      "image_urls",
      "is_active",
      "is_featured",
      "link_url",
      "published_at",
      "sort_order",
      "title",
      "video_duration_seconds",
      "view_count",
    ],
  }),
  columnCategories: section({
    table: "column_categories",
    order: "sort_order",
    shiftSortOrder: true,
    writable: ["is_active", "label", "sort_order"],
  }),
  faqs: section({
    table: "faqs",
    order: "sort_order",
    shiftSortOrder: true,
    writable: [
      "answer",
      "category",
      "content_json",
      "is_active",
      "question",
      "sort_order",
    ],
  }),
  mentorApplyFaqs: section({
    table: "mentor_apply_faqs",
    order: "sort_order",
    shiftSortOrder: true,
    writable: ["answer", "is_active", "is_notice", "question", "sort_order"],
  }),
  mentorApplyCopy: section({
    table: "mentor_apply_copy",
    order: "sort_order",
    noCreate: true,
    writable: ["copy_key", "copy_value", "label", "sort_order"],
  }),
  learningDiagnosisV2SurveyCopy: section({
    table: "learning_diagnosis_v2_survey_copy",
    order: "sort_order",
    noCreate: true,
    writable: ["copy_key", "copy_value", "label", "sort_order"],
  }),
  goalUniversityCuts: section({
    table: "goal_university_cuts",
    searchColumns: ["university_name", "department_name"],
    orderBy: [
      ["university_name", true],
      ["department_name", true],
      ["cut_type", true],
      ["id", true],
    ],
    serverPaginate: true,
    writable: [
      "avg_cut",
      "cut_type",
      "department_key",
      "department_name",
      "is_active",
      "note",
      "source",
      "source_year",
      "university_key",
      "university_name",
    ],
  }),
  popups: section({
    table: "popups",
    order: "sort_order",
    shiftSortOrder: true,
    writable: [
      "content",
      "end_date",
      "image_url",
      "is_active",
      "mobile_image_url",
      "open_new_window",
      "sort_order",
      "start_date",
      "title",
      "url",
    ],
  }),
  banners: section({
    table: "banners",
    order: "sort_order",
    shiftSortOrder: true,
    writable: [
      "button_link",
      "button_text",
      "display_seconds",
      "end_date",
      "highlight",
      "image_url",
      "is_active",
      "sort_order",
      "start_date",
      "subtitle",
      "tenant_id",
      "title",
    ],
  }),
  sideBanners: section({
    table: "home_side_banners",
    order: "sort_order",
    shiftSortOrder: true,
    writable: [
      "display_seconds",
      "end_date",
      "image_url",
      "is_active",
      "link_url",
      "mobile_image_url",
      "open_new_window",
      "sort_order",
      "start_date",
      "subtitle",
      "tenant_id",
      "title",
    ],
  }),
  footerImages: section({
    table: "footer_operator_images",
    order: "sort_order",
    shiftSortOrder: true,
    writable: ["image_url", "is_active", "sort_order", "tenant_id", "title"],
  }),
  universityAcceptances: section({
    table: "university_acceptances",
    order: "sort_order",
    shiftSortOrder: true,
    writable: [
      "count",
      "emblem_url",
      "is_active",
      "name",
      "sort_order",
      "subtitle",
      "track",
    ],
  }),
  programCategories: section({
    table: "program_categories",
    order: "sort_order",
    shiftSortOrder: true,
    writable: [
      "description",
      "icon",
      "icon_image_url",
      "is_active",
      "is_premium",
      "link",
      "name",
      "sort_order",
    ],
  }),
  mentorStrategies: section({
    table: "home_mentor_strategies",
    order: "sort_order",
    shiftSortOrder: true,
    writable: [
      "badge",
      "card_width",
      "consent_confirmed",
      "description",
      "is_active",
      "link_url",
      "mentor_name",
      "open_new_window",
      "photo_layout",
      "photo_url",
      "sort_order",
      "title",
      "title_lines",
    ],
  }),
  pageContents: section({
    table: "page_contents",
    order: "sort_order",
    shiftSortOrder: true,
    writable: [
      "body",
      "button_link",
      "button_text",
      "image_url",
      "image_urls",
      "is_active",
      "menu_group",
      "menu_group_order",
      "menu_label",
      "slug",
      "sort_order",
      "subtitle",
      "title",
    ],
  }),
  premiumConsults: section({
    table: "premium_consult_requests",
    order: "created_at",
    noCreate: true,
    writable: [
      "admin_note",
      "email",
      "message",
      "name",
      "phone",
      "service",
      "status",
    ],
  }),
  enrollments: section({
    table: "enrollments",
    listTable: "admin_enrollment_entries",
    order: "created_at",
    readOnly: true,
    noCreate: true,
    listOnlyColumns: ["payment_method", "approval_no", "source"],
    writable: [],
  }),
  refunds: section({
    table: "refunds",
    order: "requested_at",
    readOnly: true,
    writable: [],
  }),
  refundRequests: section({
    table: "refund_requests",
    noCreate: true,
    writable: [
      "admin_memo",
      "amount",
      "approval_reject_reason",
      "approval_responded_at",
      "approval_status",
      "bundle_return_amount",
      "company_fault",
      "completed_at",
      "coupon_restored_at",
      "gross_amount",
      "needs_review",
      "order_id",
      "order_item_id",
      "order_item_ids",
      "order_name",
      "parent_profile_id",
      "policy_code",
      "processed_by",
      "quote",
      "reason",
      "refund_account",
      "refund_bank",
      "refund_holder",
      "refund_method",
      "requested_by",
      "status",
      "student_profile_id",
      "terms_version",
      "toss_cancel",
      "user_id",
      "within_withdrawal",
    ],
  }),
  refundLedger: section({
    table: "admin_refund_ledger",
    order: "completed_at",
    readOnly: true,
    noCreate: true,
    writable: [],
  }),
  winningSuhaengTopicDb: section({
    table: "winning_assessment_knowledge_items",
    fixedValues: { knowledge_type: "topic_pattern" },
    order: "created_at",
    knowledgeReview: true,
    writable: [
      "career_field",
      "content",
      "embedded_at",
      "embedding",
      "embedding_error",
      "embedding_model",
      "embedding_status",
      "grade",
      "is_active",
      "keywords",
      "knowledge_type",
      "last_reviewed_at",
      "memo",
      "rag_use",
      "search_text",
      "source",
      "source_link",
      "subject",
      "title",
    ],
  }),
  winningSuhaengResourceDb: section({
    table: "winning_assessment_knowledge_items",
    fixedValues: { knowledge_type: "verified_resource" },
    order: "created_at",
    knowledgeReview: true,
    writable: [
      "career_field",
      "content",
      "embedded_at",
      "embedding",
      "embedding_error",
      "embedding_model",
      "embedding_status",
      "grade",
      "is_active",
      "keywords",
      "knowledge_type",
      "last_reviewed_at",
      "memo",
      "rag_use",
      "search_text",
      "source",
      "source_link",
      "subject",
      "title",
    ],
  }),
  winningBaseData: section({
    table: "winning_base_data",
    order: "sort_order",
    shiftSortOrder: true,
    writable: [
      "content",
      "data_type",
      "is_active",
      "memo",
      "sort_order",
      "source",
      "title",
    ],
  }),
  winningDbInputs: section({
    table: "winning_db_inputs",
    order: "created_at",
    writable: ["input_type", "memo", "parsed_data", "raw_data", "title"],
  }),
} satisfies Record<string, SectionEntry>;

export type SectionKey = keyof typeof SECTIONS;

/** 등록된 키만 돌려준다. constructor 같은 프로토타입 키는 거른다. */
export function getSection(key: string): SectionEntry | undefined {
  return Object.hasOwn(SECTIONS, key) ? SECTIONS[key as SectionKey] : undefined;
}
