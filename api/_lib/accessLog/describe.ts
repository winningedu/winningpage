// 접근 로그 한 줄을 본사 화면 항목(구분, 메뉴 이름, 내용, 가린 전화번호)으로 풀어 준다(사 #170, 교 #66).
// 순수 함수만 둔다. 읽기와 가림은 api/admin/access-logs.ts 가 한다.

export type AccessLogKind = "view" | "edit" | "export" | "proxy";

const KIND_LABELS: Record<AccessLogKind, string> = {
  view: "조회",
  edit: "수정",
  export: "출력",
  proxy: "대행",
};

export const ACCESS_LOG_KINDS = Object.keys(KIND_LABELS) as AccessLogKind[];

export function kindLabel(kind: AccessLogKind): string {
  return KIND_LABELS[kind];
}

// admin_access_logs_action_check 와 1:1. 구분 필터가 동작 목록으로 바뀔 때 쓴다.
const ACCESS_LOG_ACTIONS = [
  "download",
  "unmask",
  "view",
  "report_view",
  "update",
  "export",
  "account_issue",
  "account_reissue",
  "account_status",
  "account_delete",
  "password_set",
  "teacher_import",
  "proxy_start",
  "proxy_end",
  "settings_change",
  "member_purge",
];

/** admin_access_logs.action 을 구분으로 묶는다. 모르는 동작은 조회로 본다. */
export function kindOf(action: string): AccessLogKind {
  if (action === "export") return "export";
  if (action.startsWith("proxy_")) return "proxy";
  if (
    action === "update" ||
    action === "settings_change" ||
    action === "password_set" ||
    action === "teacher_import" ||
    action === "member_purge" ||
    action.startsWith("account_")
  ) {
    return "edit";
  }
  return "view";
}

/** 교사 전화번호는 가운데를 가리고 끝 네 자리만 보인다("010-****-1234"). 번호가 모자라면 null. */
export function maskTeacherPhone(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  const area = digits.startsWith("02") ? "02" : digits.slice(0, 3);
  return `${area}-****-${digits.slice(-4)}`;
}

// resource_key 는 두 종류가 섞여 들어온다. 콘솔 쓰기 라우트의 키와, 설정 이력 트리거(fn_log_settings_change)가
// 넣는 테이블 이름, 위닝 관리자 게이트의 메뉴 키다. 여기 없는 키는 원문을 그대로 낸다.
const MENU_LABELS: Record<string, string> = {
  enrollment: "이용현황",
  coaching: "코칭",
  coachingPdf: "코칭 PDF",
  coachingReport: "코칭 리포트",
  coachingService: "코칭 서비스",
  counselStatus: "상담 상태",
  studentDetail: "학생 상세",
  studentFlag: "학생 표시",
  studentEnrollment: "학적",
  enrollmentRequest: "학적 수정 요청",
  teacherMemo: "교사 메모",
  teacherMemoList: "교사 메모 목록",
  classGroup: "학급 묶음",
  classCapacity: "학급 정원",
  schoolYear: "학년도",
  "console.students": "학생 목록",
  "console.teachers": "교사 계정 관리",
  "console.teacher_assignments": "교사 배정",
  "console.org-info": "기관 정보",
  teacherConsoleProxy: "본사 대행",
  tenant_service_settings: "기관 서비스 설정",
  student_usage_overrides: "학생별 이용 한도",
  tenants: "기관 계약 정보",
  members: "회원 목록",
  mentorApplications: "멘토 신청 내역",
  premiumConsults: "프리미엄 상담 신청 내역",
  revenue: "매출 및 결제",
};

export function menuLabel(resourceKey: string): string {
  return MENU_LABELS[resourceKey] ?? resourceKey;
}

const PROGRAM_LABELS: Record<string, string> = {
  diagnose: "학습진단",
  target: "목표관리",
  growth: "성장설계",
  suhaeng: "수행평가",
  inquiry: "심화탐구",
  selfeval: "자기평가서",
};

const COLUMN_LABELS: Record<string, string> = {
  enabled: "사용",
  starts_on: "시작일",
  ends_on: "종료일",
  monthly_limit: "월 한도",
  term_limit: "학기 한도",
  contract_start_date: "계약 시작일",
  contract_end_date: "계약 종료일",
  term_months: "학기 길이",
  grace_ends_on: "유예 종료일",
  mou_status: "MOU",
};

export interface AccessLogContentInput {
  action: string;
  resourceKey: string;
  rowCount: number | null;
  meta: Record<string, unknown> | null;
}

function showValue(value: unknown): string {
  if (value === null || value === undefined) return "없음";
  if (value === true) return "켬";
  if (value === false) return "끔";
  return String(value);
}

// 바뀐 값 뒤 조사. 숫자는 "로", 한글은 받침이 없거나 ㄹ 이면 "로", 아니면 "으로"("없음으로").
function toParticle(text: string): string {
  const last = text.charCodeAt(text.length - 1);
  const isHangul = last >= 0xac00 && last <= 0xd7a3;
  if (!isHangul) return "로";
  const finalConsonant = (last - 0xac00) % 28;
  return finalConsonant === 0 || finalConsonant === 8 ? "로" : "으로";
}

function settingsDetail(meta: Record<string, unknown>): string {
  const before = (meta.before ?? {}) as Record<string, unknown>;
  const after = (meta.after ?? {}) as Record<string, unknown>;
  const programKey = meta.program_key;
  const program =
    typeof programKey === "string"
      ? `${PROGRAM_LABELS[programKey] ?? programKey} `
      : "";
  return Object.keys(after)
    .map((column) => {
      const to = showValue(after[column]);
      return `${program}${COLUMN_LABELS[column] ?? column} ${showValue(before[column])}에서 ${to}${toParticle(to)}`;
    })
    .join(", ");
}

/** 화면 '내용' 칸. 메뉴 이름 뒤에 설정 변경의 전후 값이나 출력 학급 수를 괄호로 붙인다. */
export function contentSummary(entry: AccessLogContentInput): string {
  const label = menuLabel(entry.resourceKey);
  let detail = "";
  if (entry.action === "settings_change" && entry.meta) {
    detail = settingsDetail(entry.meta);
  } else if (entry.action === "export" && entry.rowCount !== null) {
    detail = `학급 ${entry.rowCount}`;
  }
  return detail === "" ? label : `${label} (${detail})`;
}

export function actionsOfKind(kind: AccessLogKind): string[] {
  return ACCESS_LOG_ACTIONS.filter((action) => kindOf(action) === kind);
}
