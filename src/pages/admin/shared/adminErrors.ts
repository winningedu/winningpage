// error.message 원문 alert 위생(팀 리드 지시, 2026-08-12) — Baseline 실측 WC 코드·
// SQLSTATE 를 짧은 한국어 안내로 치환한다. 매핑에 없는 오류는 일반 실패 문구를
// 보여주고 원문은 console.error 로만 남긴다(alert 로 DB 에러 원문을 그대로
// 노출하지 않기 위함). 19개소(제네릭 저장 경로 두 벌 + 조회 2곳 포함) 전부
// 아래 reportAdminError 경유로 통일한다.
//
// ---------------------------------------------------------------------------
// QA 316 · 335 — "어느 항목이 문제인지"를 함께 말한다.
//
// 원래 이 파일은 SQLSTATE 만 보고 문구를 골랐다. 그래서 제약 위반이 나면 관리자가
// 받는 안내가 "이미 등록된 값입니다(중복)." / "필수 값이 비어 있습니다." 뿐이었고,
// **어느 칸을 고쳐야 하는지는 한 글자도 알려주지 않았다.**
//
// 실제로 겪은 것(2026-08-31): 메인 배너 관리에서 등록을 누르면 "이미 등록된
// 값입니다(중복)" 가 떴다. 제목은 겹치지 않았으니 관리자 눈에는 "등록된 값이
// 아닌데 왜?" 였다. 진짜 원인은 banners_seed_unique_idx 가 제목·강조문구·부제·
// 이미지·버튼문구·버튼링크·**순서**를 통째로 묶어 보는 인덱스라, 겹친 것이
// 제목이 아니라 순서였다는 것이다. 문구가 원인을 가린 셈이다.
//
// Postgres 응답에는 그 정보가 이미 들어 있다:
//   23502 message  null value in column "school_name" of relation "enrollments" ...
//   23505 message  duplicate key value violates unique constraint "banners_seed_unique_idx"
//         details  Key (coalesce(title, ''::text), ...)=(...) already exists.
//   23514 message  new row for relation "coupons" violates check constraint "..."
// 여기서 컬럼·제약 이름을 꺼내 config 의 필드 라벨로 옮겨 적는다. 라벨을 모르면
// 컬럼 이름을 그대로 보여준다 — 영문이라도 없는 것보다 낫다.
//
// ⚠️ details 의 값 부분은 쓰지 않는다. 중복된 실제 값(이름·연락처 등)이 그대로
//    들어 있어 alert 에 개인정보를 띄우게 된다. 컬럼 이름까지만 쓴다.
// ---------------------------------------------------------------------------

import { toast } from "@/components/ui/toast";

// Supabase PostgrestError 등 message/code를 갖는 임의 오류 객체를 느슨하게 받는다 —
// 호출부가 던지는 값이 항상 Error 인스턴스는 아니다(예: { message, code } 리터럴).
interface AdminErrorLike {
  message?: string;
  code?: string;
  details?: string;
  // Supabase StorageError 는 code 대신 statusCode("403" 등)를 실어 온다.
  // `| undefined` 명시는 exactOptionalPropertyTypes 아래에서 StorageError 의
  // `statusCode: string | undefined` 선언을 그대로 받기 위해서다.
  statusCode?: string | number | undefined;
}

/** 컬럼 키 → 화면에 쓰는 한국어 라벨. config.fields/columns 에서 만들어 넘긴다. */
export type AdminFieldLabels = Record<string, string>;

const ADMIN_ERROR_MESSAGE_MAP: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /refund_not_approved_for_completion|WC035/,
    message: "아직 승인되지 않은 환불 신청입니다.",
  },
  {
    pattern: /refund_completion_not_processable|WC036/,
    message: "지금 상태에서는 환불 완료 처리를 할 수 없습니다.",
  },
  {
    pattern: /order_already_consumed|WC032/,
    message: "이미 사용된 주문이라 환불 완료 처리를 할 수 없습니다.",
  },
  {
    pattern: /refund_amount_exceeds_paid|WC037/,
    message: "환불 금액이 결제 금액을 초과합니다.",
  },
  { pattern: /order_not_pending|WC040/, message: "이미 처리된 주문입니다." },
  {
    pattern: /order_not_paid_for_refund|WC041/,
    message: "결제 완료된 주문만 환불할 수 있습니다.",
  },
  {
    pattern: /refunded_order_immutable|WC039/,
    message: "환불 완료된 주문은 더 이상 수정할 수 없습니다.",
  },
  // 아래 두 항목은 DB 가 관리자에게 보여주려고 한국어로 쓴 안내다. alert 시절엔
  // error.message 로 그대로 보였고, 원문 노출을 끊으면서 같이 사라지지 않게 옮겨 적는다.
  // WC059: admin_members 트리거(20261021014317_busan_oct_extension_goal_gift.sql:4234)
  {
    pattern: /WC059/,
    message:
      "최고 관리자가 1명뿐이라 강등, 정지, 삭제할 수 없습니다. 다른 사람을 먼저 최고 관리자로 올려 주세요.",
  },
  // WC104: QA 계정의 본사 관리자 쓰기 차단. 모든 public 테이블의 문 단위 트리거라
  // 어느 저장 화면에서든 올라온다(20261110040330_qa_account_guard.sql:50).
  {
    pattern: /WC104/,
    message: "QA 계정이라 이 기능은 작동하지 않아요.",
  },
  // WC067 은 다른 RPC 도 쓰는 코드라 fn_create_tenant 의 메시지 이름으로 잡는다.
  {
    pattern: /not_super_admin/,
    message: "최고 관리자만 소속을 등록할 수 있습니다.",
  },
  {
    pattern: /23514/,
    message: "입력값이 저장 조건을 벗어났습니다. 값을 다시 확인해 주세요.",
  },
  {
    pattern: /23502/,
    message: "필수 값이 비어 있습니다. 항목을 모두 입력해 주세요.",
  },
  { pattern: /23505/, message: "이미 등록된 값입니다(중복)." },
  // ── storage 계열 — 업로드 실패가 전부 일반 문구로 뭉개져 원인 판별이 불가능했다
  //    (2026-08-31 dev 어드민 업로드 분석). RLS 403은 어드민 라우트 가드가 진입
  //    시점에만 돌아서 세션 만료 후 업로드하면 여기로 온다.
  {
    pattern: /row-level security|invalid JWT|JWT expired|Unauthorized|403/i,
    message: "권한이 없거나 로그인이 만료됐습니다. 다시 로그인해 주세요.",
  },
  {
    pattern: /payload too large|exceeded the maximum allowed size|413/i,
    message: "파일이 너무 큽니다. 용량을 줄여 다시 시도해 주세요.",
  },
  {
    pattern: /resource already exists|409/,
    message: "같은 경로의 파일이 이미 있습니다. 다시 시도해 주세요.",
  },
  {
    pattern: /failed to fetch|networkerror|fetch failed/i,
    message:
      "네트워크 문제로 요청하지 못했습니다. 연결 상태나 차단 프로그램을 확인해 주세요.",
  },
];

/**
 * 유니크 인덱스가 식(expression)일 때 details 에 그 식이 그대로 실린다.
 * `coalesce(title, ''::text)` → `title`, `lower(TRIM(BOTH FROM name))` → `name`.
 * 식 안에서 첫 식별자를 컬럼으로 본다 — 함수 이름과 리터럴은 걸러낸다.
 */
const SQL_NOISE = new Set([
  "coalesce",
  "lower",
  "upper",
  "trim",
  "btrim",
  "both",
  "from",
  "text",
  "int",
  "integer",
]);

function columnFromExpression(part: string): string | null {
  for (const token of part.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []) {
    if (!SQL_NOISE.has(token.toLowerCase())) return token;
  }
  return null;
}

/** `Key (a, coalesce(b, ''::text))=(...)` 의 괄호 안 컬럼 목록. */
function uniqueKeyColumns(details: string | undefined): string[] {
  if (!details) return [];

  // 값 부분에 괄호가 섞일 수 있으므로 `Key (` 이후 `)=(` 앞까지만 본다.
  const match = details.match(/Key \((.*?)\)=\(/);
  if (!match?.[1]) return [];

  // 최상위 콤마로만 자른다 — coalesce(x, '') 안쪽 콤마에 걸리면 안 된다.
  const parts: string[] = [];
  let depth = 0;
  let buffer = "";

  for (const char of match[1]) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(buffer);
      buffer = "";
      continue;
    }
    buffer += char;
  }
  parts.push(buffer);

  return parts
    .map((part) => columnFromExpression(part))
    .filter((column): column is string => Boolean(column));
}

const labelOf = (column: string, labels: AdminFieldLabels) =>
  `「${labels[column] || column}」`;

/**
 * 코드별 기본 문구에 "어느 항목인지"를 덧붙인다. 알아낼 수 없으면 기본 문구 그대로.
 */
function describeConstraint(
  error: AdminErrorLike,
  labels: AdminFieldLabels,
): string | null {
  const raw = `${error.message || ""} ${error.code || ""}`;

  if (/23502/.test(raw)) {
    const column = error.message?.match(/null value in column "([^"]+)"/)?.[1];
    if (!column) return null;
    return `필수 값이 비어 있습니다 — ${labelOf(column, labels)} 항목을 입력해 주세요.`;
  }

  if (/23505/.test(raw)) {
    const columns = uniqueKeyColumns(error.details);
    if (columns.length === 0) return null;

    const listed = columns.map((column) => labelOf(column, labels)).join("·");

    // 한 칸만 겹친 경우와 조합이 겹친 경우는 관리자가 할 일이 다르다 —
    // 전자는 그 칸을 고치면 되고, 후자는 "어느 하나라도" 바꾸면 된다.
    return columns.length === 1
      ? `${listed} 값이 이미 등록돼 있습니다. 다른 값으로 바꿔 주세요.`
      : `${listed} 조합이 이미 등록된 항목과 같습니다. 이 중 하나를 바꿔 주세요.`;
  }

  return null;
}

const GENERIC_FAILURE =
  "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";

/**
 * 우리 /api 엔드포인트가 관리자에게 보여주려고 쓴 한국어 detail 을 실은 오류.
 * Supabase/Postgres 원문과 달리 그대로 보여도 된다. 응답 본문이 우리 JSON
 * `{detail}` 일 때만 던진다(HTTP 상태나 HTML 같은 원문은 일반 Error 로 던진다).
 */
export class AdminApiError extends Error {
  readonly detail: string;

  constructor(detail: string) {
    super(detail);
    this.name = "AdminApiError";
    this.detail = detail;
  }
}

/**
 * 청크 반복 저장에서 한 청크가 실패했을 때 던지는 오류. Supabase 오류의 code, details
 * 는 그대로 들고 있어 reportAdminError 가 코드별 안내를 고를 수 있고, 어느 행인지는
 * 우리가 만든 `rows`("12~24") 로 따로 싣는다. 원문 message 는 Error.message 에
 * 넣지 않는다(콘솔에는 cause 로 남는다).
 */
export class AdminChunkError extends Error {
  readonly code: string | undefined;
  readonly details: string | undefined;
  readonly rows: string;

  constructor(stage: string, rows: string, source: AdminErrorLike) {
    super(`${stage}(${rows}행)`, { cause: source });
    this.name = "AdminChunkError";
    this.code = source.code;
    this.details = source.details;
    this.rows = rows;
  }
}

/** 청크 실패면 제목에 실패한 행 범위를 붙인다. 아니면 제목 그대로. */
export function withChunkRows(title: string, error: unknown): string {
  return error instanceof AdminChunkError ? `${title}(${error.rows}행)` : title;
}

function mapAdminErrorMessage(
  error: AdminErrorLike | null | undefined,
  labels: AdminFieldLabels = {},
): string {
  if (!error) return GENERIC_FAILURE;
  if (error instanceof AdminApiError) return error.detail;

  const detailed = describeConstraint(error, labels);
  if (detailed) return detailed;

  const raw = `${error.message || ""} ${error.code || ""} ${error.statusCode ?? ""}`;
  const hit = ADMIN_ERROR_MESSAGE_MAP.find(({ pattern }) => pattern.test(raw));
  if (hit) return hit.message;

  // 매핑에 없는 오류는 코드만 병기한다 — 원문 message 는 개인정보·DB 내부가 섞일 수
  // 있어 alert 에 싣지 않는다(파일 상단 위생 규칙). 코드 하나만 있어도 다음 사용자
  // 보고에서 원인 계열을 즉시 좁힐 수 있다.
  const codeTag = error.code || error.statusCode;
  return codeTag ? `${GENERIC_FAILURE} (코드: ${codeTag})` : GENERIC_FAILURE;
}

export function reportAdminError(
  label: string,
  error: AdminErrorLike | null | undefined,
  fieldLabels: AdminFieldLabels = {},
): void {
  console.error(label, error);
  // 제목은 호출부 접두("저장 실패" 등), 설명은 매핑된 안내문이다. 원문은 싣지 않는다.
  // 오류는 관리자가 읽고 닫을 때까지 남긴다(예전 alert 는 확인을 눌러야 닫혔다).
  // timeout 0 은 자동 닫힘 없음: @base-ui/react 1.9.0 toast/useToastManager.d.ts:32.
  toast.add({
    type: "error",
    priority: "high",
    timeout: 0,
    title: label,
    description: mapAdminErrorMessage(error, fieldLabels),
  });
}

/**
 * config 의 fields/columns 로 컬럼 키 → 라벨 표를 만든다. fields 가 우선이다
 * (편집 폼에 실제로 뜨는 이름이라 관리자가 찾기 쉽다).
 */
export function buildFieldLabels(config: {
  columns?: { key: string; label: string }[];
  fields?: { key: string; label: string }[];
}): AdminFieldLabels {
  const labels: AdminFieldLabels = {};
  for (const column of config.columns || []) labels[column.key] = column.label;
  for (const field of config.fields || []) labels[field.key] = field.label;
  return labels;
}
