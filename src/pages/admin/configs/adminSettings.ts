import { site } from "@/config/site";
import type { FieldOption } from "@/pages/admin/shared/csvExport";

// ---------------------------------------------------------------------------
// 관리자 설정(adminMembers / adminRoles) — 기획 문서 「관리자 권한 체계 안내」.
//
// 둘 다 custom: true 다. 권한 화면은 "메뉴 × 접근 수준" 매트릭스라 columns/fields
// 로 표현할 수 있는 모양이 아니고, 직원 화면은 admin_members·profiles·admin_roles
// 를 함께 읽는 데다 초대(서버 라우트 호출)가 붙는다.
//
// 목록만 AdminTable 을 재사용하므로 columns 는 남긴다(members·mentorApplications 와
// 같은 방식). table 은 제네릭 조회에 쓰이지 않는다 — custom 컴포넌트가 직접
// 조회한다 — 지만, config 형태를 맞추기 위해 실제 소스와 같은 이름을 적어둔다.
// ---------------------------------------------------------------------------

export const ADMIN_MEMBER_STATUS_OPTIONS: FieldOption[] = [
  { value: "invited", label: "초대됨" },
  { value: "active", label: "활성" },
  { value: "suspended", label: "정지" },
];

// 접근 수준 3종 — admin_role_permissions.level / admin_member_permissions.level
// CHECK 값과 1:1 이다. 라벨은 기획 문서의 어휘를 그대로 쓴다.
export const ADMIN_PERMISSION_LEVEL_OPTIONS: FieldOption[] = [
  { value: "edit", label: "수정 가능" },
  { value: "view", label: "읽기 전용" },
  { value: "none", label: "접근 불가" },
];

interface AdminSettingsColumn {
  key: string;
  label: string;
  type?: "date" | "datetime" | "maskedPhone";
  options?: FieldOption[];
}

interface AdminSettingsConfig {
  title: string;
  table: string;
  searchPlaceholder: string;
  order: string;
  readOnly: true;
  custom: true;
  customComponentKey: string;
  columns: AdminSettingsColumn[];
}

// 개인정보 접근 로그(adminAccessLogs)는 위 둘과 달리 custom 이 아니다 — 순수
// 읽기 전용 목록이라 제네릭 AdminEngine 이 그대로 그린다. 그래서 custom/
// customComponentKey 가 없는 형태를 따로 둔다.
interface AdminSettingsListConfig {
  title: string;
  table: string;
  searchPlaceholder: string;
  order: string;
  readOnly: true;
  noCreate: true;
  // 스쿨멘토(hqTenantAdmin)만 전용 컴포넌트로 바꾼다. 위닝은 둘 다 비워 둔 제네릭 목록이다.
  custom?: true;
  customComponentKey?: string;
  columns: AdminSettingsColumn[];
  fields: {
    key: string;
    label: string;
    type: "text" | "textarea";
    readOnly: true;
  }[];
}

// 로그의 action 값 2종 — admin_access_logs_action_check 와 1:1.
const ADMIN_ACCESS_ACTION_OPTIONS: FieldOption[] = [
  { value: "download", label: "다운로드" },
  { value: "unmask", label: "마스킹 해제" },
];

// resource_key 는 ADMIN_SECTION_KEYS 문자열이 그대로 들어온다. 목록에 'members'
// 라고 뜨면 어드민이 못 읽으므로 라벨로 바꿔 보여준다. 여기 없는 키(게이트가
// 나중에 다른 화면에 붙는 경우)는 formatValue 가 원문을 그대로 낸다.
const ADMIN_ACCESS_RESOURCE_OPTIONS: FieldOption[] = [
  { value: "members", label: "회원 목록" },
  { value: "mentorApplications", label: "멘토 신청 내역" },
  { value: "premiumConsults", label: "프리미엄 상담 신청 내역" },
  { value: "revenue", label: "매출 및 결제" },
];

export const adminSettingsConfigs: Record<
  string,
  AdminSettingsConfig | AdminSettingsListConfig
> = {
  // 와이어프레임 목록: 번호 | 직원명 | 부서 | 이메일 | 전화번호 | 가입일 | 더보기
  adminMembers: {
    title: "관리자 관리",
    table: "admin_member_directory",
    searchPlaceholder: "직원명, 부서, 이메일 검색",
    order: "invited_at",
    readOnly: true,
    custom: true,
    customComponentKey: "adminMembers",
    columns: [
      { key: "member_name", label: "직원명" },
      { key: "department", label: "부서" },
      { key: "member_email", label: "이메일" },
      { key: "member_phone", label: "전화번호", type: "maskedPhone" },
      { key: "role_name", label: "권한 묶음" },
      {
        key: "status",
        label: "상태",
        options: ADMIN_MEMBER_STATUS_OPTIONS,
      },
      { key: "joined_at", label: "가입일", type: "date" },
    ],
  },

  // 와이어프레임 목록: 번호 | 권한 묶음 이름 | 포함 메뉴 | 관리
  // '포함 메뉴'는 파생값이라 컴포넌트가 직접 그린다(컬럼 정의에는 없다).
  adminRoles: {
    title: "관리자 권한 관리",
    table: "admin_roles",
    searchPlaceholder: "권한 묶음 이름 검색",
    order: "created_at",
    readOnly: true,
    custom: true,
    customComponentKey: "adminRoles",
    columns: [
      { key: "name", label: "권한 묶음 이름" },
      { key: "description", label: "설명" },
    ],
  },

  // QA 268·270·228·223·271·269 게이트가 남기는 원장의 열람 화면
  // (20260831041800_admin_access_logs). RLS 가 최고 관리자에게만 select 를 열어
  // 두므로, 실무 관리자가 URL 로 들어와도 빈 목록이 된다.
  adminAccessLogs: {
    title: "개인정보 접근 로그",
    table: "admin_access_log_entries",
    searchPlaceholder: "관리자명, 계정, 사유 검색",
    order: "created_at",
    // 감사 기록이라 열람만 한다. readOnly 면 목록의 관리 열이 ✎ 대신 👁(상세보기)
    // 가 되고 🗑 도 빠진다 — hideRowEdit 로 행 열기 자체를 막지 않는 이유는,
    // 사유가 길면 목록에서 잘려 보이기 때문이다. DB 쪽도 update/delete 정책이
    // 없어 어차피 어떤 경로로도 고쳐지지 않는다.
    readOnly: true,
    noCreate: true,
    ...(site.features.hqTenantAdmin
      ? { custom: true as const, customComponentKey: "adminAccessLogs" }
      : {}),
    columns: [
      { key: "created_at", label: "일시", type: "datetime" },
      { key: "actor_name", label: "관리자" },
      { key: "actor_email", label: "계정" },
      { key: "action", label: "동작", options: ADMIN_ACCESS_ACTION_OPTIONS },
      {
        key: "resource_key",
        label: "대상 메뉴",
        options: ADMIN_ACCESS_RESOURCE_OPTIONS,
      },
      { key: "row_count", label: "건수" },
      { key: "reason", label: "사유" },
    ],
    // 👁 로 연 상세. 목록에서 잘리는 사유 전문을 보기 위한 것이라 전부 읽기 전용이다.
    fields: [
      { key: "created_at", label: "일시", type: "text", readOnly: true },
      { key: "actor_name", label: "관리자", type: "text", readOnly: true },
      { key: "actor_email", label: "계정", type: "text", readOnly: true },
      { key: "action", label: "동작", type: "text", readOnly: true },
      { key: "resource_key", label: "대상 메뉴", type: "text", readOnly: true },
      { key: "row_count", label: "건수", type: "text", readOnly: true },
      { key: "target_id", label: "대상 회원 id", type: "text", readOnly: true },
      { key: "reason", label: "사유", type: "textarea", readOnly: true },
    ],
  },
};
