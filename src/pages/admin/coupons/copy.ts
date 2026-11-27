// 쿠폰 화면 문구와 표시 함수. 문구는 승인된 규범이라 값을 바꾸지 않는다.

import { formatDateTime } from "@/lib/time/format";
import {
  COUPON_ERROR,
  COUPON_GRANT_TYPES,
} from "../../../../shared/coupon/contract.js";
import { PROBLEM_CODE } from "../../../../shared/http/codes.js";

// DB 컬럼명으로 대체하던 폴백은 제거했다(FieldName 참고), 라벨이 아직
// 승인되지 않은 자리는 값 그대로 null 로 두어 아무것도 그리지 않는다.
export const FIELD_LABEL: Record<string, string> = {
  slug: "쿠폰 키", // 값을 바꾸면 시드 멱등성에 영향
  code: "고객 입력 코드",
  title: "쿠폰 이름",
  discount_amount: "할인 금액",
  min_amount: "최소 결제 금액",
  valid_until: "사용 기한",
  is_active: "판매 상태",
  max_uses_per_user: "1인당 사용 횟수",
  max_redemptions: "총 발행 수량",
  stackable: "중복 사용",
  grant_type: "배포 방식",
  grant_on_signup: "가입 시 자동 발급",
  tenant_id: "소속(단체 쿠폰)",
  kind: "쿠폰 종류", // 파생값(DB 컬럼 아님), tenant_id/code+max_redemptions 로 목록에서만 계산
  used: "사용 건수", // 파생값(DB 컬럼 아님), 유효 / 전체(무효화 포함)
  id: "내부 키",
  created_at: "등록 일시",
  // ── 사용이력(coupon_redemptions) ──
  order_id: "주문번호",
  user: "사용자", // 파생값. profiles 조인
  voided_at: "무효화 일시",
  void_reason: "무효화 사유",
  // ── 발급 관리(coupon_grants) ──
  granted_at: "발급 일시",
  granted_by: "발급 출처", // 값 자체는 signup(가입) / admin(직접) / event
  revoked_at: "회수 일시",
  revoke_reason: "회수 사유",
  email: "이메일", // "사용자 검색(이메일,이름)" 라벨. 목록 칼럼엔 없고 검색 폼에서만 쓴다
};

// 무제한/무기한(NULL 규약)을 고르는 선택지의 라벨(2026-08-12, 사용자 지시로
// 채움). 지어낸 신규 문구가 아니다, '무제한'은 이미 이 저장소가 쓰는
// 어휘다(Header.jsx:54 "무제한 점검하세요", Admin.jsx:37 주석, 이 파일 자체의
// 설계 주석 106행 "무제한/무기한"). 이 상수 하나를 max_uses_per_user/
// max_redemptions(횟수, "무제한"이 정확)와 valid_until(기간, "무기한"이 더
// 정확)이 함께 쓴다(nullableText:232, NullableField:407), 두 의미를 엄밀히
// 가르려면 라벨을 필드별로 나눠야 하는데, 그건 8건 문구 채우기 범위를 넘는
// 구조 변경이라 하지 않는다. '무제한'은 두 맥락 모두에서 통용되는 표현이라
// (예: "무제한 이용권") 단일 라벨로 문제가 없다. UNLIMITED_FALLBACK('∞')은
// 값이 비었을 때만 쓰이는 방어용 폴백으로 남긴다.
export const UNLIMITED_LABEL = "무제한";
export const UNLIMITED_FALLBACK = "∞";

// 아이콘 전용 액션의 접근성 라벨. 팀 리드가 승인한 코퍼스 규범 문자열이다
// (2026-08-11), AdminTable 의 기존 수정/삭제 아이콘 버튼(Admin.jsx:4674-4692)
// 은 여전히 무라벨이지만, 이 화면은 승인된 라벨을 받았으므로 붙인다.
export const HISTORY_ACTION_LABEL = "사용 이력";
export const VOID_ACTION_LABEL = "무효화";
export const BACK_ACTION_LABEL = "목록으로";
export const VOID_REASON_PLACEHOLDER = "무효화 사유를 입력하세요";

// 알려지지 않은 에러 코드에 대한 어드민 공통 문구. DB 원문은 화면에 올리지 않고 콘솔에만 남긴다.
export const ADMIN_UNKNOWN_ERROR_TEXT = "알 수 없는 오류가 발생했습니다.";

// 조회 실패 문구. `${TITLE} 조회 실패` 제목 뒤에 붙는 재시도 유도 문구다.
export const ADMIN_LOAD_ERROR_TEXT = "잠시 후 다시 시도해 주세요.";

// 서버 problem code 별 문구. 예전 PostgREST/RPC 코드(42501, WC002, WC003, WC004, 23514)와 같은 문구다.
const FORBIDDEN_TEXT = "관리자 권한이 없습니다.";
// 키는 서버 problem code(shared/ 계약)다.
export const VOID_ERROR_TEXT: Record<string, string> = {
  [PROBLEM_CODE.FORBIDDEN]: FORBIDDEN_TEXT,
  [COUPON_ERROR.REDEMPTION_ALREADY_VOIDED]:
    "이미 무효화되었거나 존재하지 않는 사용 이력입니다.",
};
export const GRANT_ERROR_TEXT: Record<string, string> = {
  [PROBLEM_CODE.FORBIDDEN]: FORBIDDEN_TEXT,
  [COUPON_ERROR.COUPON_NOT_GRANTABLE]: "발급할 수 없는 쿠폰입니다.",
};
export const REVOKE_ERROR_TEXT: Record<string, string> = {
  [PROBLEM_CODE.FORBIDDEN]: FORBIDDEN_TEXT,
  [COUPON_ERROR.GRANT_ALREADY_REVOKED]:
    "이미 회수되었거나 존재하지 않는 발급입니다.",
};

// 쿠폰 등록과 수정 실패 문구. 금액 CHECK(COUPON_CHECK_FAILED)와 파생 CHECK(COUPON_CAP_MISMATCH)를 가른다.
export const COUPON_SAVE_ERROR_TEXT: Record<string, string> = {
  [COUPON_ERROR.COUPON_CHECK_FAILED]:
    "할인 금액\u00b7최소 결제 금액을 확인해 주세요. 할인 금액은 0보다 커야 하고, 최소 결제 금액은 0 이상이어야 합니다.",
  [COUPON_ERROR.COUPON_CAP_MISMATCH]:
    "배포 방식과 1인당 사용 횟수가 맞지 않습니다. 발급형은 1인당 사용 횟수가 1이어야 하고, 조건형은 무제한이어야 합니다.",
};

// slug 중복은 저장 전에 막는다(요구사항).
//   ① 필드 옆에 충돌한 기존 쿠폰 행을 그대로 보여주고(데이터라서 창작이 아니다)
//   ② 차단 alert 는 아래 승인된 문구를 쓴다.
export const SLUG_DUPLICATE_TEXT = "이미 사용 중인 쿠폰 키입니다.";

// validateForm 이 tenant_id(단체 쿠폰)+grant_type='granted' 조합을 막을 때
// 쓰는 전용 문구(2026-08-27 org_code 기준으로 작성, 2026-09-22 소속 선택
// 드롭다운으로 전환). 일반 "<X> 항목을 입력해주세요." 템플릿은 이미 값이
// 채워진 필드를 "안 채웠다"고 말하게 돼 사실과 어긋난다, 그래서 tenant_id
// 하나만 이 템플릿을 쓰지 않고 별도 문구를 alert 에서 분기한다.
export const ORG_CODE_GRANTED_CONFLICT_TEXT =
  "소속(단체 쿠폰)은 조건형 쿠폰에만 설정할 수 있습니다. 발급형으로 쓰려면 소속을 비워주세요.";

// 소속 선택 드롭다운 도움말(2026-08-27 작성, 2026-09-22 profiles.org_code >
// profiles.tenant_id 비교 판정(fn_tenant_matches)으로 전환). 운영자가 알아야
// "왜 이 쿠폰이 특정 회원한테만 보이는지" 문의를 줄일 수 있다.
export const ORG_CODE_HELPER_TEXT =
  "선택하면 이 소속으로 배정된 학생\u00b7학부모만 사용할 수 있습니다(단체 쿠폰). '소속 없음'을 고르면 제한 없음.";

export const GIFT_CODE_PRESET_HINT_TEXT =
  "선물 쿠폰 = 무작위 코드 + 총 발행 수량 1 (1회 사용)";

// ── 발급 관리(2026-08-11 추가) 문구 ──────────────────────────────────────
export const GRANTS_ACTION_LABEL = "발급 이력";
export const REVOKE_ACTION_LABEL = "회수";
export const REVOKE_REASON_PLACEHOLDER = "회수 사유를 입력하세요";
export const USER_SEARCH_PLACEHOLDER = "이메일로 검색";
// 이미 발급된 사용자를 검색 결과에서 표시하는 자리. 발급 버튼 자리에 체크
// 아이콘을 두고(버튼 없음) 이 문구를 title/aria-label 로 붙인다.
export const ALREADY_GRANTED_TEXT = "이미 발급된 사용자입니다.";

export const TITLE = "쿠폰관리";

// 폼 이탈 확인. AdminForm(AdminEngine.tsx)과 같은 문구다.
export const UNSAVED_CONFIRM_TEXT =
  "저장하지 않은 변경사항이 있습니다. 나가시겠습니까?";

export const INPUT_CLASS = "h-9 w-full px-3 text-sm";

export function moneyText(value: number | string | null | undefined) {
  return `${Number(value || 0).toLocaleString()}원`;
}

// is_active 전용. '사용/미사용' 은 formatValue(Admin.jsx:3238) 가 boolean 컬럼에
// 쓰는 기존 표기이고, is_active 는 실제로 "사용 여부" 라서 의미가 맞다.
export function boolText(value: unknown) {
  return value ? "사용" : "미사용";
}

// stackable 은 불리언이지만 의미가 "사용 여부" 가 아니라 "다른 쿠폰과 결합 가능"
// 이다, 여기에 '사용/미사용' 을 쓰면 목록이 거짓말을 한다(폼에서 라벨 없는
// 체크박스를 쓴 것과 같은 이유). 헤더가 컬럼명을 이미 들고 있으므로 값은 기호로만
// 표시한다. 새 한국어 문구를 만들지 않는 쪽의 선택이다.
export function flagMark(value: unknown) {
  return value ? "✓" : "-";
}

// timestamptz 를 보는 사람의 브라우저 시간대 'YYYY-MM-DD HH:mm' 로 보인다.
export function dateTimeText(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return formatDateTime(date);
}

// NULL = 무기한,무제한 규약을 목록에서 표기. 값이 있으면 그대로, NULL 이면 ∞.
export function nullableText(
  value: number | string | null | undefined,
  suffix = "",
) {
  if (value === null || value === undefined)
    return UNLIMITED_LABEL ?? UNLIMITED_FALLBACK;
  return `${Number(value).toLocaleString()}${suffix}`;
}

// DB 컬럼명으로 대체하던 폴백은 제거했다, FIELD_LABEL 을 직접 쓴다. 라벨이
// 아직 승인되지 않은 키(email)는 값 그대로 null 을 반환해 아무것도 그리지
// 않는다(지어낸 문구로 채우지 않는다).
export function FieldName({ k }: { k: string }) {
  return FIELD_LABEL[k];
}

export const GRANT_TYPES: readonly string[] = COUPON_GRANT_TYPES;

// grant_type 표시 라벨(팀 리드 승인, 2026-08-11). 목록 칼럼과 폼 라디오 둘 다
// 이 라벨로 보여주고, DB 값,폼 상태(form.grant_type)는 GRANT_TYPES 의 영문을
// 그대로 유지한다, 어드민 폼이 한글 값을 영문 CHECK 컬럼에 써 결제(payments)
// 등록이 실패하던 결함을 반복하지 않는다.
export const GRANT_TYPE_LABEL: Record<string, string> = {
  auto: "조건형",
  granted: "발급형",
};

// max_uses_per_user 는 sql/70 이후 grant_type 의 파생값이라(발급형=1,
// 조건형=무제한) 손으로 고칠 수 없다(disabled), grant_on_signup 체크박스와
// 같은 이유다. NullableField 가 비활성일 때만 이 안내를 붙인다(2026-08-12,
// 사용자 지시로 신규 작성).
export const MAX_USES_PER_USER_DERIVED_HINT_TEXT =
  "배포 방식에 따라 자동으로 정해집니다.";
