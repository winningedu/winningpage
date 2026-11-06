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
