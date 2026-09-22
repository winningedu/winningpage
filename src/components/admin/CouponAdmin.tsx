import {
  Ban,
  Check,
  ChevronLeft,
  Edit3,
  History,
  Plus,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/lib/supabase";
import { useAdminDetailBack } from "@/pages/admin/shared/useAdminDetailBack";
import type { TablesInsert, TablesUpdate } from "@/types/database.types";

// coupons insert/update는 formToPayload가 NULLABLE_KEYS를 동적 키로 조립해서
// 만든다 — 최종 형태만 생성 타입과 대조한다(아래 formToPayload 참고).
type CouponInsert = TablesInsert<"coupons">;
type CouponUpdate = TablesUpdate<"coupons">;

// =====================================================================
// 어드민 "쿠폰관리" — 목록 / 생성·수정 / 사용이력 / void / 발급 관리
//
// 왜 이 화면이 필요한가 (sql/55_coupon_policy.sql 이 남긴 결함 이력)
//   지금까지 쿠폰 운영은 Supabase Studio 직접 조작이 전제였고, 그 전제 때문에
//   결함이 반복됐다: ① max_uses_per_user 를 깜빡 비우면 곧바로 무제한 쿠폰이
//   됐다(그래서 sql/55 0)절이 DEFAULT 를 1로 뒤집었다) ② redemption 되돌림이
//   raw DELETE 였다(그래서 1-b/1-g 절이 voided_at + fn_void_coupon_redemption
//   을 만들었다) ③ id 만 보고 판단해 'signup-6000' 이 실제로 2,000원인 것을
//   놓쳤다(그래서 slug 'signup-2000' 으로 정정) ④ 선착순 이벤트를 is_active
//   수동 토글로 우회했다(그래서 1-b/0-b 절이 max_redemptions 를 추가). 이
//   화면이 그 전제를 없앤다 — 그래서 아래 설계가 전부 그 4건을 겨냥한다.
//
// 왜 CONFIGS 제네릭 CRUD 가 아니라 custom 컴포넌트인가
//   Admin.jsx 의 제네릭 경로(loadRows → AdminTable → AdminForm)로는 4가지가
//   성립하지 않는다.
//     1) 목록의 "사용 건수" 는 다른 테이블(coupon_redemptions)에서 파생된다.
//        loadRows 는 config.table 한 개를 select('*') 할 뿐이다.
//     2) max_uses_per_user / max_redemptions / valid_until 은 NULL=무제한·
//        무기한 규약이라 3상태(미선택 / 무제한 / 값) 입력이 필요하다. 제네릭
//        AdminForm 의 required 검사는 `String(form[key] ?? '').trim() === ''`
//        라 "NULL 을 의도적으로 선택" 과 "안 채움" 을 구분할 수 없다 — 이
//        화면의 핵심 요구(무제한을 고를 때도 명시적으로 고르게 한다)와 정면으로
//        어긋난다.
//     3) slug 중복은 저장 전에 잡아야 한다(DB 23505 원문 노출 금지). 제네릭
//        config.validate 는 동기 함수라 DB 를 조회할 수 없다 — 이미 로드된
//        목록을 아는 이 컴포넌트만 할 수 있다.
//     4) 사용이력 드릴다운 + void RPC 는 행 액션이 2개 필요한데 AdminTable 의
//        액션 칼럼은 수정/삭제로 고정이다. 그리고 이 도메인에는 삭제 버튼을
//        두면 안 된다(아래 참고).
//   그래서 premiumBookPages 선례와 같은 방식(config.custom + CustomComponent)
//   으로 붙이고, 표·폼 마크업은 AdminTable/AdminForm 의 클래스 문자열을 그대로
//   따라 시각 일관성만 맞춘다(Admin.jsx:4584 AdminTable / :4141 AdminForm).
//   두 컴포넌트를 직접 import 하지 않는 이유는 순환 참조다 — Admin.jsx 가 이
//   파일을 import 하므로 역방향 import 를 만들지 않는다.
//
// 삭제 버튼이 없는 이유
//   coupons 는 orders.coupon_id / coupon_redemptions.coupon_id 두 FK 의
//   ON DELETE RESTRICT 대상이다(sql/55 1-c절) — 한 번이라도 주문에 물린 쿠폰은
//   애초에 지울 수 없다. 삭제 버튼을 두면 "쓰인 쿠폰에서만 실패하는" 버튼이
//   된다. 판매 종료의 정본 손잡이는 is_active=false 다. 사용이력(void)도
//   같은 원칙으로 DELETE 가 아니라 voided_at UPDATE 만 한다
//   (fn_void_coupon_redemption 은 절대 DELETE 하지 않는다).
//   RLS 도 이 판단과 짝을 맞춰 for delete 정책을 만들지 않았다
//   (sql/55 1-d-2절 — coupons admin select/insert/update 3개만).
//
// 발급 관리(2026-08-11 추가)
//   coupons.grant_type='granted' 인 발급형 쿠폰은 coupon_grants 에 살아있는
//   발급 행이 있는 사용자만 쓸 수 있다(sql/55 1-h/2-c절). 그 원장을 다루는
//   화면이 이 파일의 네 번째 뷰다 — 쿠폰별 드릴다운이라 사용이력(view
//   'history')과 완전히 같은 형태를 쓴다(뒤로가기 + 쿠폰 식별 헤더 + 표 +
//   행 액션 1개). 새 패턴을 만들지 않는다.
//
//   쓰기는 전부 RPC 다(fn_grant_coupon / fn_revoke_coupon_grant).
//   coupon_grants 에는 insert/update/delete RLS 정책이 아예 없어서
//   PostgREST 로는 어드민도 쓸 수 없다 — 이건 의도된 설계다(sql/55 1-h절).
//   coupon_redemptions 는 어드민 update 정책이 열려 있어 PATCH 한 번으로
//   voided_at 을 되돌릴 수 있다는 지적을 이미 받았고, 새 테이블에서 같은
//   구멍을 반복하지 않았다.
//
//   회수(revoke)도 삭제가 아니다 — revoked_at 만 채운다. 회수된 행은 목록에
//   회색으로 남고 액션 칼럼이 '-' 가 된다(void 와 동일). 되돌리려면 되살리는
//   게 아니라 "다시 발급" 이고, 그러면 새 행이 생겨 회수 이력이 그대로 남는다.
// =====================================================================

// ── 화면 문구 ────────────────────────────────────────────────────────
// 이 프로젝트는 신규 한국어 화면 문구를 창작하지 않는다(문구 조사로 규범이
// 수치로 확정돼 있고 신규 문구는 사용자 승인 대상이다). 아래 열 라벨 23개는
// 팀 리드가 승인한 코퍼스 규범 문자열이다(2026-08-11).
//
// coupons 테이블(sql/55_coupon_policy.sql 계열) 로우 — 이 파일 로컬 전용 타입(새 전역
// 타입 파일 없음). 실제로 읽는 컬럼만 명시하고 나머지는 인덱스 시그니처로 열어둔다.
interface CouponRow {
  id: string;
  slug: string;
  code: string | null;
  title: string;
  discount_amount: number;
  min_amount: number;
  valid_until: string | null;
  max_uses_per_user: number | null;
  max_redemptions: number | null;
  stackable: boolean;
  grant_type: string;
  grant_on_signup: boolean;
  is_active: boolean;
  // 단체 쿠폰 축(2026-08-27 org_code, 2026-09-22 tenants FK 로 전환). NULL =
  // 소속 제한 없음. org_code(text, 자유 입력)는 죽은 컬럼으로 남아 더 이상
  // 읽지도 쓰지도 않는다(20260922002935 컬럼 코멘트).
  tenant_id: string | null;
  created_at?: string;
  [key: string]: unknown;
}

interface RedemptionRow {
  // coupon_redemptions.id는 identity 정수 PK다(생성 타입 대조 결과) — string이 아니다.
  id: number;
  coupon_id: string;
  order_id?: string;
  user_id: string | null;
  discount_amount: number;
  created_at: string;
  voided_at: string | null;
  void_reason?: string | null;
  [key: string]: unknown;
}

interface GrantRow {
  // coupon_grants.id도 identity 정수 PK다(생성 타입 대조 결과).
  id: number;
  coupon_id: string;
  user_id: string;
  granted_at: string;
  granted_by: string;
  // 발급분 자체의 사용 기한(20260825000010). NULL = 무기한.
  valid_until: string | null;
  revoked_at: string | null;
  revoke_reason?: string | null;
  [key: string]: unknown;
}

interface ProfileRow {
  id: string;
  name?: string | null;
  email?: string | null;
}

// 소속(테넌트) 선택지 — 드롭다운에만 쓴다(2026-09-22, org_code 자유 입력 대체).
interface TenantOption {
  id: string;
  name: string;
}

type ViewMode = "list" | "create" | "edit" | "history" | "grants";

// 신규 등록/수정 폼 로컬 상태 — NULLABLE_KEYS 3필드는 `${key}_mode` 3상태 컨트롤과
// 짝을 이룬다(NullableField 참고). discount_amount 등 숫자 필드는 입력 중 빈 문자열도
// 거쳐가므로 number|string 유니온으로 원본 동작을 그대로 반영한다.
interface CouponForm {
  is_active: boolean;
  slug: string;
  code: string;
  title: string;
  discount_amount: number | string;
  min_amount: number | string;
  stackable: boolean;
  grant_type: string;
  grant_on_signup: boolean;
  // 단체 쿠폰 축(2026-08-27 org_code → 2026-09-22 tenants FK). 드롭다운이
  // 담는 값은 tenants.id(uuid) 또는 빈 문자열(소속 없음)이다.
  tenant_id: string;
  valid_until: string;
  valid_until_mode: string;
  max_uses_per_user: number | string;
  max_uses_per_user_mode: string;
  max_redemptions: number | string;
  max_redemptions_mode: string;
}

// DB 컬럼명으로 대체하던 폴백은 제거했다(FieldName 참고) — 라벨이 아직
// 승인되지 않은 자리는 값 그대로 null 로 두어 아무것도 그리지 않는다.
const FIELD_LABEL: Record<string, string> = {
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
  kind: "쿠폰 종류", // 파생값(DB 컬럼 아님) — tenant_id/code+max_redemptions 로 목록에서만 계산
  used: "사용 건수", // 파생값(DB 컬럼 아님) — 유효 / 전체(무효화 포함)
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
  email: "이메일", // "사용자 검색(이메일·이름)" 라벨. 목록 칼럼엔 없고 검색 폼에서만 쓴다
};

// 무제한/무기한(NULL 규약)을 고르는 선택지의 라벨(2026-08-12, 사용자 지시로
// 채움). 지어낸 신규 문구가 아니다 — '무제한'은 이미 이 저장소가 쓰는
// 어휘다(Header.jsx:54 "무제한 점검하세요", Admin.jsx:37 주석, 이 파일 자체의
// 설계 주석 106행 "무제한/무기한"). 이 상수 하나를 max_uses_per_user/
// max_redemptions(횟수, "무제한"이 정확)와 valid_until(기간, "무기한"이 더
// 정확)이 함께 쓴다(nullableText:232, NullableField:407) — 두 의미를 엄밀히
// 가르려면 라벨을 필드별로 나눠야 하는데, 그건 8건 문구 채우기 범위를 넘는
// 구조 변경이라 하지 않는다. '무제한'은 두 맥락 모두에서 통용되는 표현이라
// (예: "무제한 이용권") 단일 라벨로 문제가 없다. UNLIMITED_FALLBACK('∞')은
// 값이 비었을 때만 쓰이는 방어용 폴백으로 남긴다.
const UNLIMITED_LABEL = "무제한";
const UNLIMITED_FALLBACK = "∞";

// 아이콘 전용 액션의 접근성 라벨. 팀 리드가 승인한 코퍼스 규범 문자열이다
// (2026-08-11) — AdminTable 의 기존 수정/삭제 아이콘 버튼(Admin.jsx:4674-4692)
// 은 여전히 무라벨이지만, 이 화면은 승인된 라벨을 받았으므로 붙인다.
const HISTORY_ACTION_LABEL = "사용 이력";
const VOID_ACTION_LABEL = "무효화";
const BACK_ACTION_LABEL = "목록으로";
const VOID_REASON_PLACEHOLDER = "무효화 사유를 입력하세요";

// fn_void_coupon_redemption 이 구분해 던지는 두 에러(sql/55 1-g절).
// 42501 / WC002 모두 팀 리드가 승인한 문구다(2026-08-11). 그 밖의 예상 밖
// 코드(이 함수는 이 둘만 던지도록 설계돼 있어 이론상 도달하지 않는다)는
// submitVoid 의 명시적 분기(MyPage.jsx REFUND_ERROR_TEXT 와 같은 패턴)에서
// ADMIN_UNKNOWN_ERROR_TEXT 를 보여준다 — DB 원문(error.message)을 화면에
// 그대로 띄우던 경로를 닫았다(팀 리드 지시, 2026-08-11).
const VOID_ERROR_TEXT: Record<string, string> = {
  42501: "관리자 권한이 없습니다.",
  WC002: "이미 무효화되었거나 존재하지 않는 사용 이력입니다.",
};

// 알려지지 않은 에러 코드에 대한 어드민 공통 문구(팀 리드 승인, 2026-08-11).
// MyPage.jsx REFUND_UNKNOWN_ERROR_TEXT 와 같은 패턴 — "문구가 없어서 DB 원문
// 으로 대체"가 아니라, DB 원문 노출 경로 자체를 막기 위한 고정 문구다.
// submitVoid/submitGrant/submitRevoke 세 곳이 쓴다. 원인 추적은 화면이 아니라
// console.error(원본 error)로 남긴다(loadGrants/searchUsers 등 이 파일의
// 기존 조회 실패 처리와 같은 방식). 이 화면 밖에서도 같은 문제가 생기면
// 이 상수를 그대로 재사용할 수 있도록 export 한다.
const ADMIN_UNKNOWN_ERROR_TEXT = "알 수 없는 오류가 발생했습니다.";

// 조회(select) 실패 4곳(loadList/loadHistory/loadGrants/searchUsers) 전용
// 문구(2026-08-12, 사용자 지시로 채움). ADMIN_UNKNOWN_ERROR_TEXT 를 그대로
// 쓰지 않는다 — 이 문구는 이미 `${TITLE} 조회 실패:` 접두로 "무엇이 실패했는지"
// 를 밝힌 뒤 붙는 것이라, 그 뒤에 다시 "알 수 없는 오류가 발생했습니다"를
// 붙이면 이중으로 모호해진다. 대신 이 저장소의 재시도 유도 관용구(Login.jsx
// /MyPage.jsx REFUND_UNKNOWN_ERROR_TEXT 의 "잠시 후 다시 시도해 주세요.")를
// 재사용한다 — DB 원문(error.message)은 console.error 로만 남긴다.
const ADMIN_LOAD_ERROR_TEXT = "잠시 후 다시 시도해 주세요.";

// 쿠폰 등록·수정 실패 전용(2026-08-12). sql/58 이 coupons 에 건 금액 CHECK
// (discount_amount>0, min_amount>=0)를 어기면 Postgres 원문이 그대로 뜨던
// 자리다 — 23514(check_violation)를 명시적으로 잡아 무엇을 고쳐야 하는지
// 알려준다. 그 밖의 예상 밖 에러는 ADMIN_UNKNOWN_ERROR_TEXT 로 떨어진다
// (VOID_ERROR_TEXT/GRANT_ERROR_TEXT 와 같은 분기 규범).
const COUPON_SAVE_ERROR_TEXT: Record<string, string> = {
  23514:
    "할인 금액·최소 결제 금액을 확인해 주세요. 할인 금액은 0보다 커야 하고, 최소 결제 금액은 0 이상이어야 합니다.",
};

// sql/70 이 추가한 파생 CHECK(coupons_cap_derived_from_grant_type_check —
// 발급형은 1인당 사용 횟수 1, 조건형은 무제한이어야 한다) 전용 문구(2026-08-12).
// validateForm 이 화면에서 먼저 막지만, 폼을 거치지 않은 경합(다른 창에서
// grant_type 을 바꾼 뒤 저장)까지 막을 수는 없어 DB 제약명으로도 분기한다.
const COUPON_SAVE_CAP_MISMATCH_TEXT =
  "배포 방식과 1인당 사용 횟수가 맞지 않습니다. 발급형은 1인당 사용 횟수가 1이어야 하고, 조건형은 무제한이어야 합니다.";

// slug 중복은 저장 전에 막는다(요구사항).
//   ① 필드 옆에 충돌한 기존 쿠폰 행을 그대로 보여주고(데이터라서 창작이 아니다)
//   ② 차단 alert 는 아래 승인된 문구를 쓴다.
const SLUG_DUPLICATE_TEXT = "이미 사용 중인 쿠폰 키입니다.";

// validateForm 이 tenant_id(단체 쿠폰)+grant_type='granted' 조합을 막을 때
// 쓰는 전용 문구(2026-08-27 org_code 기준으로 작성, 2026-09-22 소속 선택
// 드롭다운으로 전환). 일반 "<X> 항목을 입력해주세요." 템플릿은 이미 값이
// 채워진 필드를 "안 채웠다"고 말하게 돼 사실과 어긋난다 — 그래서 tenant_id
// 하나만 이 템플릿을 쓰지 않고 별도 문구를 alert 에서 분기한다.
const ORG_CODE_GRANTED_CONFLICT_TEXT =
  "소속(단체 쿠폰)은 조건형 쿠폰에만 설정할 수 있습니다. 발급형으로 쓰려면 소속을 비워주세요.";

// 소속 선택 드롭다운 도움말(2026-08-27 작성, 2026-09-22 profiles.org_code →
// profiles.tenant_id 비교 판정(fn_tenant_matches)으로 전환). 운영자가 알아야
// "왜 이 쿠폰이 특정 회원한테만 보이는지" 문의를 줄일 수 있다.
const ORG_CODE_HELPER_TEXT =
  "선택하면 이 소속으로 배정된 학생·학부모만 사용할 수 있습니다(단체 쿠폰). '소속 없음'을 고르면 제한 없음.";

// 선물 쿠폰 코드 생성 프리셋(2026-08-27) — WIN-XXXX-XXXX, 0/O·1/I 제외(전화로
// 불러줄 때 헷갈리는 문자를 빼는 이 저장소의 기존 관례와 같은 이유).
const GIFT_CODE_CHARSET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const GIFT_CODE_GROUP_LENGTH = 4;
const GIFT_CODE_PRESET_HINT_TEXT =
  "선물 쿠폰 = 무작위 코드 + 총 발행 수량 1 (1회 사용)";

function generateGiftCode(): string {
  const bytes = new Uint8Array(GIFT_CODE_GROUP_LENGTH * 2);
  crypto.getRandomValues(bytes);
  const chars = Array.from(
    bytes,
    (b) => GIFT_CODE_CHARSET[b % GIFT_CODE_CHARSET.length],
  );
  const first = chars.slice(0, GIFT_CODE_GROUP_LENGTH).join("");
  const second = chars.slice(GIFT_CODE_GROUP_LENGTH).join("");
  return `WIN-${first}-${second}`;
}

// ── 발급 관리(2026-08-11 추가) 문구 ──────────────────────────────────────
const GRANTS_ACTION_LABEL = "발급 이력";
const REVOKE_ACTION_LABEL = "회수";
const REVOKE_REASON_PLACEHOLDER = "회수 사유를 입력하세요";
const USER_SEARCH_PLACEHOLDER = "이메일로 검색";
// 이미 발급된 사용자를 검색 결과에서 표시하는 자리. 발급 버튼 자리에 체크
// 아이콘을 두고(버튼 없음) 이 문구를 title/aria-label 로 붙인다.
const ALREADY_GRANTED_TEXT = "이미 발급된 사용자입니다.";

// fn_grant_coupon / fn_revoke_coupon_grant 가 구분해 던지는 에러(sql/55 1-i절).
// 42501 / WC003 / WC004 모두 팀 리드가 승인한 문구다(2026-08-11). 그 밖의
// 예상 밖 코드는 submitGrant/submitRevoke 의 명시적 분기에서 ADMIN_UNKNOWN_ERROR_TEXT
// 를 보여준다 — VOID_ERROR_TEXT 와 같은 규범이다.
const GRANT_ERROR_TEXT: Record<string, string> = {
  42501: "관리자 권한이 없습니다.",
  WC003: "이미 회수되었거나 존재하지 않는 발급입니다.",
  WC004: "발급할 수 없는 쿠폰입니다.",
};

// ── 재사용한 기존 문구 (출처) ──────────────────────────────────────────
//   '쿠폰관리'                        팀 리드 확정 범위 명칭 + sql/55 1-g절 주석
//                                     ('향후 만들어질 어드민 "쿠폰관리" 화면')
//   '사용' / '미사용'                  Admin.jsx AdminInput radioBoolean(:3474-3495),
//                                     formatValue(:3238)
//   '등록' / '초기화' / '저장' / '취소'  Admin.jsx 목록 헤더 + AdminForm 푸터
//   '등록된 데이터가 없습니다.'          Admin.jsx AdminTable(:4610)
//   '데이터를 불러오는 중입니다.'        Admin.jsx(:5216)
//   '전체 N건' / '번호' / '관리'         Admin.jsx AdminTable(:4592/:4599/:4606)
//   '<X> 항목을 입력해주세요.'           Admin.jsx AdminForm submit(:4258).
//                                     X 에 스키마 식별자를 넣는다(창작 아님)
//   '저장 완료'                        Admin.jsx saveRow(:5054)
//   '등록 실패: ' / '수정 실패: ' / ' 조회 실패: '  Admin.jsx saveRow/loadRows
//   'N원'                             Admin.jsx formatValue money(:3240)
const TITLE = "쿠폰관리";

// coupon_redemptions 는 이력 테이블이라 무한히 늘어난다. 목록의 사용 건수는
// (coupon_id, voided_at) 두 컬럼만 받아 클라이언트에서 집계한다 — PostgREST 는
// GROUP BY 를 못 하고, 집계 전용 함수를 새로 만드는 것은 이번 범위의 "sql/ 은
// 필요 최소한" 원칙에 어긋난다. 현재 dev 실측 0행이라 실무 부담이 없고, 이
// 상한에 닿을 볼륨이 되면 그때 집계 RPC 를 만드는 것이 맞다(그 시점에 이 상수가
// 신호가 된다 — 상한에 걸린 집계는 아래에서 별도로 표시한다).
const REDEMPTION_SCAN_LIMIT = 10000;
// 사용이력 드릴다운 1쿠폰당 조회 상한. 서버 페이지네이션은 이번 범위 밖이다.
const REDEMPTION_PAGE_LIMIT = 200;
// 발급 관리 드릴다운 1쿠폰당 조회 상한. 사용이력과 같은 값을 쓴다 — 같은 성격의
// 드릴다운에 서로 다른 상한을 두면 운영자가 어느 화면이 잘렸는지 외워야 한다.
// (PostgREST 의 db-max-rows 아래로 잡아 둔다 — 상한을 그보다 크게 잡으면
//  서버가 먼저 자르고 화면은 잘린 줄 모른다.)
const GRANT_PAGE_LIMIT = 200;
// 사용자 검색 결과 상한. 어드민이 이메일 일부로 좁혀 고르는 용도라 넉넉하다.
const USER_SEARCH_LIMIT = 20;

const INPUT_CLASS =
  "h-9 w-full border border-[#9ca3af] bg-white px-3 text-sm outline-hidden disabled:bg-gray-100";

function moneyText(value: number | string | null | undefined) {
  return `${Number(value || 0).toLocaleString()}원`;
}

// is_active 전용. '사용/미사용' 은 formatValue(Admin.jsx:3238) 가 boolean 컬럼에
// 쓰는 기존 표기이고, is_active 는 실제로 "사용 여부" 라서 의미가 맞다.
function boolText(value: unknown) {
  return value ? "사용" : "미사용";
}

// stackable 은 불리언이지만 의미가 "사용 여부" 가 아니라 "다른 쿠폰과 결합 가능"
// 이다 — 여기에 '사용/미사용' 을 쓰면 목록이 거짓말을 한다(폼에서 라벨 없는
// 체크박스를 쓴 것과 같은 이유). 헤더가 컬럼명을 이미 들고 있으므로 값은 기호로만
// 표시한다. 새 한국어 문구를 만들지 않는 쪽의 선택이다.
function flagMark(value: unknown) {
  return value ? "✓" : "-";
}

// timestamptz → 'YYYY-MM-DD HH:mm' (Asia/Seoul). Header.jsx:80 / PopupLayer.jsx:7
// 의 명명 존 방식을 따른다 — 오프셋(+9h)을 손으로 더하지 않는다.
function dateTimeText(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date
    .toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
    .replace("T", " ")
    .slice(0, 16);
}

// NULL = 무기한·무제한 규약을 목록에서 표기. 값이 있으면 그대로, NULL 이면 ∞.
function nullableText(value: number | string | null | undefined, suffix = "") {
  if (value === null || value === undefined)
    return UNLIMITED_LABEL ?? UNLIMITED_FALLBACK;
  return `${Number(value).toLocaleString()}${suffix}`;
}

// DB 컬럼명으로 대체하던 폴백은 제거했다 — FIELD_LABEL 을 직접 쓴다. 라벨이
// 아직 승인되지 않은 키(email)는 값 그대로 null 을 반환해 아무것도 그리지
// 않는다(지어낸 문구로 채우지 않는다).
function FieldName({ k }: { k: string }) {
  return FIELD_LABEL[k];
}

const FORM_KEYS: (keyof CouponForm)[] = [
  "is_active",
  "slug",
  "code",
  "tenant_id",
  "title",
  "discount_amount",
  "min_amount",
  "valid_until",
  "max_uses_per_user",
  "max_redemptions",
  "stackable",
  "grant_type",
  "grant_on_signup",
];

// coupons_grant_type_check 가 허용하는 값. DB 에 쓰는 값은 반드시 이 두 문자열
// 그대로다 — 아래 GRANT_TYPE_LABEL 은 화면 표시 전용이라 절대 payload 로
// 흘려보내지 않는다(formToPayload 는 form.grant_type 원본을 그대로 쓴다).
const GRANT_TYPES: string[] = ["auto", "granted"];

// grant_type 표시 라벨(팀 리드 승인, 2026-08-11). 목록 칼럼과 폼 라디오 둘 다
// 이 라벨로 보여주고, DB 값·폼 상태(form.grant_type)는 GRANT_TYPES 의 영문을
// 그대로 유지한다 — 어드민 폼이 한글 값을 영문 CHECK 컬럼에 써 결제(payments)
// 등록이 실패하던 결함을 반복하지 않는다.
const GRANT_TYPE_LABEL: Record<string, string> = {
  auto: "조건형",
  granted: "발급형",
};

// NULL 을 고를 수 있는 3개 필드. 3상태다:
//   '' = 미선택(신규 등록의 기본값 — 저장이 막힌다)
//   'unlimited' = NULL 을 명시적으로 선택
//   'value' = 값 입력
// max_uses_per_user 를 비운 채 저장되면 다시 무제한 쿠폰이 되므로(이 화면이
// 없애려는 결함 ①) "무제한" 을 고르려면 반드시 골라야 한다. valid_until /
// max_redemptions 도 같은 NULL 규약이라 같은 컨트롤·같은 규칙을 쓴다 — 필드마다
// 다른 규칙을 두면 운영자가 어느 것이 강제인지 외워야 한다.
const NULLABLE_KEYS: (keyof CouponForm)[] = [
  "valid_until",
  "max_uses_per_user",
  "max_redemptions",
];

// max_uses_per_user 는 sql/70 이후 grant_type 의 파생값이라(발급형=1,
// 조건형=무제한) 손으로 고칠 수 없다(disabled) — grant_on_signup 체크박스와
// 같은 이유다. NullableField 가 비활성일 때만 이 안내를 붙인다(2026-08-12,
// 사용자 지시로 신규 작성).
const MAX_USES_PER_USER_DERIVED_HINT_TEXT =
  "배포 방식에 따라 자동으로 정해집니다.";

function emptyForm(): CouponForm {
  return {
    is_active: true,
    slug: "",
    code: "",
    tenant_id: "",
    title: "",
    discount_amount: "",
    min_amount: 0,
    stackable: false,
    // DB DEFAULT 와 같은 값으로 시작한다(sql/55 0-e절) — 신규 쿠폰은
    // 조건형이 기본이고, 발급형은 명시적으로 골라야 한다.
    grant_type: "auto",
    grant_on_signup: false,
    valid_until: "",
    valid_until_mode: "",
    max_uses_per_user: "",
    // grant_type 기본값 'auto' 의 파생값과 일치시킨다(sql/70
    // coupons_cap_derived_from_grant_type_check — 조건형은 1인당 사용 횟수
    // 무제한이어야 한다). NullableField 가 이 필드를 항상 disabled 로 잠가
    // 화면에서 라디오를 눌러 고칠 수 없으므로, 여기를 ''(미선택)으로 두면
    // validateForm 이 매번 막아 신규 등록 기본 경로가 원천 봉쇄된다
    // (2026-08-12, 리뷰 BLOCK 수정).
    max_uses_per_user_mode: "unlimited",
    max_redemptions: "",
    max_redemptions_mode: "",
  };
}

function rowToForm(row: CouponRow): CouponForm {
  const form = { ...emptyForm() };

  form.is_active = row.is_active !== false;
  form.slug = row.slug ?? "";
  form.code = row.code ?? "";
  form.tenant_id = row.tenant_id ?? "";
  form.title = row.title ?? "";
  form.discount_amount = row.discount_amount ?? "";
  form.min_amount = row.min_amount ?? 0;
  form.stackable = row.stackable === true;
  // 알 수 없는 값이 오면 조건형으로 떨어뜨리지 않고 원본을 그대로 들고 있다가
  // 저장 시 validateForm 이 막는다 — 화면이 조용히 값을 바꿔 저장하면
  // "열어보기만 했는데 정책이 바뀌는" 사고가 된다.
  form.grant_type = row.grant_type ?? "auto";
  form.grant_on_signup = row.grant_on_signup === true;

  // NULLABLE_KEYS 3필드는 `${key}_mode` 라는 별도 필드명으로 확장 접근한다 —
  // CouponForm에 이름이 정적으로 존재하지만 여기선 동적으로 조합하므로 로컬
  // Record 캐스트로 인덱싱한다(진짜 동적 키 접근 지점).
  const dynamicForm = form as unknown as Record<string, unknown>;
  for (const key of NULLABLE_KEYS) {
    const value = row[key as string];
    dynamicForm[`${key}_mode`] =
      value === null || value === undefined ? "unlimited" : "value";
    dynamicForm[key as string] =
      value === null || value === undefined ? "" : value;
  }

  return form;
}

function formToPayload(form: CouponForm): CouponInsert & CouponUpdate {
  // NULLABLE_KEYS(3개)를 동적 키로 채우기 전까지는 내부적으로 Record로
  // 조립한다 — 루프가 끝나면 slug/title/discount_amount 등 필수 필드까지
  // 전부 채워진 CouponInsert(=CouponUpdate와 키가 같다) 형태가 되므로 반환
  // 직전에 한 번만 좁힌다(동적 키 조립이라 정적으로 좁힐 수 없다).
  const payload: Record<string, unknown> = {
    slug: String(form.slug ?? "").trim(),
    // code 는 UNIQUE 인데 NULL 은 다중 허용이다 — 빈 문자열로 저장하면 두 번째
    // 코드 없는 쿠폰이 23505 로 막힌다. 반드시 NULL 로 정규화한다.
    code: String(form.code ?? "").trim() || null,
    // 드롭다운이 tenants.id(uuid) 를 직접 담으므로 정규화가 필요 없다 —
    // org_code 시절의 upper(trim()) 대칭 처리(coupons_org_code_normalized_check)는
    // tenant_id 전환과 함께 사라진다.
    tenant_id: form.tenant_id || null,
    title: String(form.title ?? "").trim(),
    discount_amount: Number(form.discount_amount),
    min_amount: Number(form.min_amount),
    is_active: form.is_active === true,
    stackable: form.stackable === true,
    grant_type: form.grant_type,
    // coupons_grant_on_signup_check 가 "granted 가 아니면 켤 수 없다" 를
    // 강제한다 — 폼이 이미 비활성화하지만, 라디오를 되돌린 직후의 잔여값이
    // 그대로 전송돼 23514 원문이 노출되는 걸 여기서도 막는다.
    grant_on_signup:
      form.grant_type === "granted" && form.grant_on_signup === true,
  };

  const dynamicForm = form as unknown as Record<string, unknown>;
  for (const key of NULLABLE_KEYS) {
    if (dynamicForm[`${key}_mode`] === "unlimited") {
      payload[key as string] = null;
      continue;
    }
    payload[key as string] =
      key === "valid_until" ? dynamicForm[key] : Number(dynamicForm[key]);
  }

  return payload as CouponInsert & CouponUpdate;
}

// 검증 실패한 첫 키를 반환(없으면 null). 문구는 AdminForm 의 기존 템플릿에
// 이 키를 끼워 넣어 만든다 — 새 문구를 만들지 않는다.
function validateForm(form: CouponForm): keyof CouponForm | null {
  if (String(form.slug ?? "").trim() === "") return "slug";
  if (String(form.title ?? "").trim() === "") return "title";

  const discount = Number(form.discount_amount);
  // DB 에 CHECK 는 없지만 0원/음수 쿠폰은 의미가 없다(fn_redeem_coupons 도
  // 할인 0원을 적용해도 주문 금액이 그대로다). "안 채운 것" 과 같이 취급한다.
  if (!Number.isInteger(discount) || discount <= 0) return "discount_amount";

  const min = Number(form.min_amount);
  if (!Number.isInteger(min) || min < 0) return "min_amount";

  // coupons_grant_type_check 를 화면에서 먼저 건다 — 23514 원문 노출 방지.
  if (!GRANT_TYPES.includes(form.grant_type)) return "grant_type";

  // 단체 쿠폰(tenant_id)은 조건형(auto)에만 얹는다(2026-08-27 org_code 기준
  // 결정, 2026-09-22 tenant_id 로 축 전환). 발급형은 이미 coupon_grants 로
  // "누가 쓸 수 있는가"를 정하고 있어 소속 축까지 겹치면 두 판정이 동시에
  // 걸려 운영이 헷갈린다 — 소속 제한이 필요하면 발급을 끄고 소속만 쓴다.
  if (
    String(form.tenant_id ?? "").trim() !== "" &&
    form.grant_type === "granted"
  ) {
    return "tenant_id";
  }

  // `${key}_mode` 는 동적 조합 키라 CouponForm의 정적 키로 인덱싱할 수 없다 —
  // rowToForm/formToPayload와 같은 이유로 Record 캐스트를 쓴다.
  const dynamicForm = form as unknown as Record<string, unknown>;
  for (const key of NULLABLE_KEYS) {
    const mode = dynamicForm[`${key}_mode`];
    if (mode !== "unlimited" && mode !== "value") return key;
    if (mode !== "value") continue;

    if (key === "valid_until") {
      if (String(form[key] ?? "").trim() === "") return key;
      continue;
    }

    const num = Number(form[key]);
    // coupons_max_uses_per_user_check / coupons_max_redemptions_check 가
    // `is null or > 0` 이다 — 여기서 막지 않으면 23514 원문이 노출된다.
    if (!Number.isInteger(num) || num <= 0) return key;
  }

  // sql/70 coupons_cap_derived_from_grant_type_check — 발급형은 1인당 사용
  // 횟수가 반드시 1, 조건형은 반드시 무제한이어야 한다. NullableField 가
  // max_uses_per_user 를 disabled 로 잠가 화면 조작으로는 어긋날 수 없지만,
  // rowToForm 이 들고 온 기존 값(전환 전 데이터)까지 방어해 저장 시 23514
  // 원문이 뜨지 않게 한다.
  if (form.grant_type === "granted") {
    if (
      form.max_uses_per_user_mode !== "value" ||
      Number(form.max_uses_per_user) !== 1
    ) {
      return "max_uses_per_user";
    }
  } else if (form.grant_type === "auto") {
    if (form.max_uses_per_user_mode !== "unlimited") {
      return "max_uses_per_user";
    }
  }

  return null;
}

// 3상태 컨트롤: [∞] / [값] 라디오 + 값 입력. 값 모드가 아니면 입력을 비활성화해
// "무제한인데 숫자가 남아 있는" 화면을 만들지 않는다. disabled=true 면(현재는
// max_uses_per_user 뿐 — grant_type 파생값) 라디오 두 개와 입력까지 전부 잠그고
// 안내 문구를 붙인다 — grant_on_signup 체크박스(:1528)와 같은 "파생값은 손편집
// 금지" 규범이다.
interface NullableFieldProps {
  fieldKey: keyof CouponForm;
  type: "date" | "number";
  mode: string;
  value: number | string;
  // fieldKey로 조합한 동적 키(`${fieldKey}_mode`, fieldKey 자체)를 patch에 그대로
  // 흘려보낸다 — CouponForm의 정적 프로퍼티 타입으로 표현할 수 없는 진짜 동적
  // 지점이라 Record로 느슨하게 받는다(patch는 strict:false라 그대로 호환된다).
  onChange: (values: Record<string, unknown>) => void;
  disabled?: boolean;
}

function NullableField({
  fieldKey,
  type,
  mode,
  value,
  onChange,
  disabled = false,
}: NullableFieldProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <label className="inline-flex items-center gap-2 text-sm font-bold">
        <input
          type="radio"
          name={`${fieldKey}_mode`}
          checked={mode === "unlimited"}
          disabled={disabled}
          onChange={() =>
            onChange({ [`${fieldKey}_mode`]: "unlimited", [fieldKey]: "" })
          }
        />
        <span className="text-base leading-none">
          {UNLIMITED_LABEL ?? UNLIMITED_FALLBACK}
        </span>
      </label>

      <label className="inline-flex items-center gap-2 text-sm font-bold">
        <input
          type="radio"
          name={`${fieldKey}_mode`}
          checked={mode === "value"}
          disabled={disabled}
          onChange={() => onChange({ [`${fieldKey}_mode`]: "value" })}
        />
        <span className="w-40">
          <input
            type={type}
            min={type === "number" ? 1 : undefined}
            value={value ?? ""}
            disabled={disabled || mode !== "value"}
            onChange={(e) =>
              onChange({
                [fieldKey]:
                  type === "number"
                    ? e.target.value.replace(/[^0-9]/g, "")
                    : e.target.value,
              })
            }
            className={INPUT_CLASS}
          />
        </span>
      </label>

      {disabled && (
        <span className="text-xs font-bold text-gray-500">
          {MAX_USES_PER_USER_DERIVED_HINT_TEXT}
        </span>
      )}
    </div>
  );
}

interface RedemptionStats {
  byCoupon: Record<string, { active: number; total: number }>;
  truncated: boolean;
}

export default function CouponAdmin() {
  const [view, setView] = useState<ViewMode>("list"); // list | create | edit | history | grants
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  // 소속(테넌트) 드롭다운 선택지(2026-09-22) — 등록·수정 폼의 소속 필드가
  // 여기서 읽는다. RLS 는 fn_admin_can('tenants','view') 라 어드민이면 통과한다.
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [redemptionStats, setRedemptionStats] = useState<RedemptionStats>({
    byCoupon: {},
    truncated: false,
  });
  // grant_type 이 'granted' 가 아니게 전환된 쿠폰도, 과거에 살아있는(회수 안 된)
  // 발급이 있었다면 발급 이력 버튼을 계속 보여줘야 한다(요구사항 ⑥) — 행
  // 데이터 자체엔 이 정보가 없어 목록 로드 시 한 번 더 조회해 집합으로 든다.
  const [grantedCouponIds, setGrantedCouponIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [loading, setLoading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CouponForm>(() => emptyForm());
  const [saving, setSaving] = useState(false);

  const [historyCoupon, setHistoryCoupon] = useState<CouponRow | null>(null);
  const [historyRows, setHistoryRows] = useState<RedemptionRow[]>([]);
  const [historyProfiles, setHistoryProfiles] = useState<
    Record<string, ProfileRow>
  >({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [voidingId, setVoidingId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("");
  // 진행 중 표시. 아이콘 버튼은 더블클릭이 쉬워서(피드백이 alert 뿐이다) 두 번째
  // 호출이 WC002/WC003 알럿을 띄운다 — 요청 중에는 액션을 잠근다.
  const [actionBusy, setActionBusy] = useState(false);

  // ── 발급 관리 ──
  const [grantCoupon, setGrantCoupon] = useState<CouponRow | null>(null);
  const [grantRows, setGrantRows] = useState<GrantRow[]>([]);
  const [grantProfiles, setGrantProfiles] = useState<
    Record<string, ProfileRow>
  >({});
  const [grantLoading, setGrantLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<ProfileRow[] | null>(null); // null = 아직 검색 안 함
  const [userSearching, setUserSearching] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);

    // 정렬은 slug 오름차순 — sql/55 3)절 fn_usable_coupons 의 `order by c.slug`
    // 와 같은 기준이라 "어드민에서 보이는 순서 = 판정 순회 순서" 가 된다.
    const [couponRes, redemptionRes, grantExistsRes, tenantRes] =
      await Promise.all([
        supabase.from("coupons").select("*").order("slug", { ascending: true }),
        supabase
          .from("coupon_redemptions")
          .select("coupon_id, voided_at")
          .limit(REDEMPTION_SCAN_LIMIT),
        // 요구사항 ⑥ — 발급 이력 버튼 게이트용. revoked_at is null(살아있는 발급)
        // 인 행만 봐서 grantedCouponIds 를 만든다. 실패해도 목록 자체는 살리고
        // 게이트는 grant_type 단독 조건으로 열화시킨다(redemptionStats 와 같은
        // 열화 방식).
        supabase
          .from("coupon_grants")
          .select("coupon_id")
          .is("revoked_at", null)
          .limit(REDEMPTION_SCAN_LIMIT),
        // 소속 드롭다운 선택지(2026-09-22). 실패해도 쿠폰 목록 자체는 살리고
        // 드롭다운만 빈 채로 열화시킨다(redemptionStats 와 같은 원칙).
        supabase.from("tenants").select("id, name").order("name"),
      ]);

    setLoading(false);

    if (couponRes.error) {
      console.error(couponRes.error);
      alert(`${TITLE} 조회 실패: ${ADMIN_LOAD_ERROR_TEXT}`);
      setCoupons([]);
      return;
    }

    setCoupons(couponRes.data || []);

    if (grantExistsRes.error) {
      // 이력 버튼 게이트만 열화시킨다 — grant_type==='granted' 단독 조건으로
      // 되돌아간다(전환된 쿠폰의 이력 버튼만 못 보일 뿐, 목록 자체는 살아있다).
      console.warn(
        "발급 이력 존재 여부 조회 실패:",
        grantExistsRes.error.message,
      );
      setGrantedCouponIds(new Set());
    } else {
      setGrantedCouponIds(
        new Set((grantExistsRes.data || []).map((row) => row.coupon_id)),
      );
    }

    if (tenantRes.error) {
      // 드롭다운 선택지만 열화시킨다 — grantExistsRes/redemptionRes 와 같은 원칙.
      console.warn("소속 목록 조회 실패:", tenantRes.error.message);
      setTenants([]);
    } else {
      setTenants((tenantRes.data as TenantOption[]) || []);
    }

    if (redemptionRes.error) {
      // 쿠폰 목록 자체는 살린다 — 사용 건수만 못 보는 상태로 열화시킨다.
      console.warn("사용 건수 조회 실패:", redemptionRes.error.message);
      setRedemptionStats({ byCoupon: {}, truncated: false });
      return;
    }

    const byCoupon: Record<string, { active: number; total: number }> = {};
    for (const row of redemptionRes.data || []) {
      if (!byCoupon[row.coupon_id]) {
        byCoupon[row.coupon_id] = { active: 0, total: 0 };
      }
      // 위에서 없으면 방금 채웠으므로 항상 존재한다(noUncheckedIndexedAccess 우회).
      const bucket = byCoupon[row.coupon_id]!;
      bucket.total += 1;
      if (row.voided_at === null) bucket.active += 1;
    }

    setRedemptionStats({
      byCoupon,
      truncated: (redemptionRes.data || []).length >= REDEMPTION_SCAN_LIMIT,
    });
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const slugIndex = useMemo(() => {
    const map = new Map<string, CouponRow>();
    for (const row of coupons) map.set(row.slug, row);
    return map;
  }, [coupons]);

  // 입력 중인 slug 가 다른 쿠폰과 충돌하는지. 충돌 쿠폰 행 자체를 반환해
  // 화면에 그대로 보여준다(문구 창작 없이 상황을 전달하는 방법).
  const slugConflict = useMemo(() => {
    const slug = String(form.slug ?? "").trim();
    if (!slug) return null;
    const found = slugIndex.get(slug);
    if (!found) return null;
    if (view === "edit" && found.id === editingId) return null;
    return found;
  }, [form.slug, slugIndex, view, editingId]);

  // NullableField 등 동적 키 조합 호출부와도 함께 쓰이므로 Record로 느슨하게
  // 받는다(NullableFieldProps.onChange 주석과 같은 이유).
  function patch(values: Record<string, unknown>) {
    setForm((prev) => ({ ...prev, ...values }));
  }

  // 선물 쿠폰 프리셋(2026-08-27) — 무작위 코드 + 총 발행 수량(max_redemptions)
  // 1로 한 번에 맞춘다. valid_until 은 건드리지 않는다(비어 있으면 무기한
  // 그대로, 운영자가 이미 채워 둔 값도 유지) — 기한은 쿠폰마다 다르게 두고
  // 싶을 수 있어 프리셋이 임의로 정하지 않는다.
  function applyGiftCodePreset() {
    patch({
      code: generateGiftCode(),
      max_redemptions_mode: "value",
      max_redemptions: 1,
    });
  }

  function openCreate() {
    setForm(emptyForm());
    setEditingId(null);
    setView("create");
  }

  function openEdit(row: CouponRow) {
    setForm(rowToForm(row));
    setEditingId(row.id);
    setView("edit");
  }

  // QA 317 — 등록·수정·이력·발급 네 화면 모두 목록을 갈아끼우는 전체 화면이라
  // 뒤로가기가 직전 메뉴로 튄다. 어느 화면이든 목록으로 돌아오게 한다.
  useAdminDetailBack(view !== "list", () => {
    setView("list");
    setEditingId(null);
    setHistoryCoupon(null);
  });

  function closeForm() {
    setView("list");
    setEditingId(null);
    setForm(emptyForm());
  }

  async function save() {
    const invalidKey = validateForm(form);
    if (invalidKey) {
      // tenant_id 는 "안 채움"이 아니라 "조합 충돌"이라 전용 문구를 먼저
      // 분기한다(2026-08-27) — 그 외 키는 기존 AdminForm 템플릿(Admin.jsx:4258
      // "<X> 항목을 입력해주세요.")에 FIELD_LABEL 을 끼워 넣는다(2026-08-12,
      // 사용자 지시).
      if (invalidKey === "tenant_id") {
        alert(ORG_CODE_GRANTED_CONFLICT_TEXT);
        return;
      }
      alert(`${FIELD_LABEL[invalidKey] ?? invalidKey} 항목을 입력해주세요.`);
      return;
    }

    if (slugConflict) {
      // 사전 검증 — DB 23505(coupons_slug_key) 원문을 사용자에게 보이지 않는다.
      alert(SLUG_DUPLICATE_TEXT ?? "slug 항목을 입력해주세요.");
      return;
    }

    const payload = formToPayload(form);
    setSaving(true);

    // view==='edit'는 항상 openEdit()이 먼저 editingId를 채우고서만 진입한다 —
    // 타입상으로는 string|null이라 eq() 앞에서 방어적으로 ??로 좁힌다(빈 문자열이면
    // 어떤 행도 매치되지 않아 안전하게 no-op된다).
    const { error } =
      view === "create"
        ? await supabase.from("coupons").insert(payload)
        : await supabase
            .from("coupons")
            .update(payload)
            .eq("id", editingId ?? "");

    setSaving(false);

    if (error) {
      console.error(error);
      // 23514 는 제약이 둘이라(금액 CHECK / sql/70 파생 CHECK) error.code 만으로
      // 못 가른다 — Postgres 가 error.message 에 싣는 제약명으로 분기한다
      // (2026-08-12, 사용자 지시). 그 밖의 코드는 기존 COUPON_SAVE_ERROR_TEXT.
      let saveErrorText: string;
      if (
        error.code === "23514" &&
        String(error.message ?? "").includes(
          "coupons_cap_derived_from_grant_type_check",
        )
      ) {
        saveErrorText = COUPON_SAVE_CAP_MISMATCH_TEXT;
      } else if (error.code in COUPON_SAVE_ERROR_TEXT) {
        // 위 `in` 가드로 존재가 보장되지만 인덱스 접근 결과 타입에는 반영되지 않는다(noUncheckedIndexedAccess).
        saveErrorText =
          COUPON_SAVE_ERROR_TEXT[error.code] ?? ADMIN_UNKNOWN_ERROR_TEXT;
      } else {
        saveErrorText = ADMIN_UNKNOWN_ERROR_TEXT;
      }
      alert(`${view === "create" ? "등록" : "수정"} 실패: ${saveErrorText}`);
      return;
    }

    alert("저장 완료");
    closeForm();
    await loadList();
  }

  async function openHistory(row: CouponRow) {
    setHistoryCoupon(row);
    setHistoryRows([]);
    setHistoryProfiles({});
    setVoidingId(null);
    setVoidReason("");
    setView("history");
    await loadHistory(row.id);
  }

  async function loadHistory(couponId: string) {
    setHistoryLoading(true);

    const { data, error } = await supabase
      .from("coupon_redemptions")
      .select("*")
      .eq("coupon_id", couponId)
      .order("created_at", { ascending: false })
      .limit(REDEMPTION_PAGE_LIMIT);

    if (error) {
      setHistoryLoading(false);
      console.error(error);
      alert(`${TITLE} 조회 실패: ${ADMIN_LOAD_ERROR_TEXT}`);
      setHistoryRows([]);
      return;
    }

    const rows = data || [];
    setHistoryRows(rows);

    // coupon_redemptions.user_id 는 auth.users 를 참조하므로 PostgREST 임베딩으로
    // profiles 를 끌어올 수 없다(profiles 로 가는 FK 가 없다) — 별도 조회한다.
    // 게스트 결제는 user_id 가 NULL 이라 빠진다.
    const userIds = [
      ...new Set(
        rows
          .map((row) => row.user_id)
          .filter((id): id is string => id !== null),
      ),
    ];

    if (userIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", userIds);

      if (profileError) {
        // 이력 자체는 살린다 — 사용자 이름만 못 보는 상태로 열화시킨다.
        console.warn("사용자 조회 실패:", profileError.message);
      } else {
        const map: Record<string, ProfileRow> = {};
        for (const profile of profiles || []) map[profile.id] = profile;
        setHistoryProfiles(map);
      }
    }

    setHistoryLoading(false);
  }

  async function submitVoid(row: RedemptionRow) {
    if (actionBusy) return;
    setActionBusy(true);

    // p_reason은 optional(string) 인자라 exactOptionalPropertyTypes 아래서
    // undefined를 명시적으로 넣을 수 없다 — 값이 없으면 키 자체를 뺀다.
    const { error } = await supabase.rpc("fn_void_coupon_redemption", {
      p_redemption_id: row.id,
      ...(voidReason.trim() ? { p_reason: voidReason.trim() } : {}),
    });

    if (error) {
      setActionBusy(false);
      // 명시적 분기(MyPage.jsx REFUND_ERROR_TEXT 와 같은 패턴) — 알려진
      // 코드(42501/WC002)는 VOID_ERROR_TEXT 를, 그 밖의 예상 밖 코드는
      // ADMIN_UNKNOWN_ERROR_TEXT 를 쓴다. 원본은 콘솔에 남겨 추적 가능하게 한다.
      console.error(error);
      alert(
        `수정 실패: ${error.code in VOID_ERROR_TEXT ? VOID_ERROR_TEXT[error.code] : ADMIN_UNKNOWN_ERROR_TEXT}`,
      );
      return;
    }

    setVoidingId(null);
    setVoidReason("");
    alert("저장 완료");
    await loadHistory(row.coupon_id);
    // 목록의 사용 건수(유효/전체)도 갱신돼야 한다.
    await loadList();
    setActionBusy(false);
  }

  // ── 발급 관리 ──────────────────────────────────────────────────────
  async function openGrants(row: CouponRow) {
    setGrantCoupon(row);
    setGrantRows([]);
    setGrantProfiles({});
    setRevokingId(null);
    setRevokeReason("");
    setUserQuery("");
    setUserResults(null);
    setView("grants");
    await loadGrants(row.id);
  }

  async function loadGrants(couponId: string) {
    setGrantLoading(true);

    const { data, error } = await supabase
      .from("coupon_grants")
      .select("*")
      .eq("coupon_id", couponId)
      .order("granted_at", { ascending: false })
      .limit(GRANT_PAGE_LIMIT);

    if (error) {
      setGrantLoading(false);
      console.error(error);
      alert(`${TITLE} 조회 실패: ${ADMIN_LOAD_ERROR_TEXT}`);
      setGrantRows([]);
      return;
    }

    const rows = data || [];
    setGrantRows(rows);

    // coupon_grants.user_id 는 auth.users FK 라 profiles 를 임베딩할 수 없다 —
    // 사용이력(loadHistory)과 같은 방식으로 따로 조회한다.
    const userIds = [
      ...new Set(rows.map((row) => row.user_id).filter(Boolean)),
    ];

    if (userIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", userIds);

      if (profileError) {
        // 발급 목록 자체는 살린다 — 사용자 이름만 못 보는 상태로 열화시킨다.
        console.warn("사용자 조회 실패:", profileError.message);
      } else {
        const map: Record<string, ProfileRow> = {};
        for (const profile of profiles || []) map[profile.id] = profile;
        setGrantProfiles(map);
      }
    }

    setGrantLoading(false);
  }

  // 이미 살아있는 발급을 가진 사용자 id 집합. 검색 결과에서 발급 버튼을 감추는
  // 데 쓴다 — fn_grant_coupon 은 멱등이라 눌러도 안전하지만, 버튼이 있으면
  // "눌렀는데 아무 일도 안 일어난다" 로 읽힌다.
  const grantedUserIds = useMemo(
    () =>
      new Set(
        grantRows
          .filter((row) => row.revoked_at === null)
          .map((row) => row.user_id),
      ),
    [grantRows],
  );

  async function searchUsers() {
    // PostgREST 의 or 필터는 콤마·괄호로 절을 구분한다 — 검색어에 그 문자가
    // 있으면 필터 문법이 깨진다(주입이 아니라 파싱 오류). 미리 걷어낸다.
    const query = userQuery.trim().replace(/[,()*"\\]/g, "");
    if (!query) {
      setUserResults(null);
      return;
    }

    setUserSearching(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, email")
      .or(`email.ilike.%${query}%,name.ilike.%${query}%`)
      .limit(USER_SEARCH_LIMIT);
    setUserSearching(false);

    if (error) {
      console.error(error);
      alert(`${TITLE} 조회 실패: ${ADMIN_LOAD_ERROR_TEXT}`);
      setUserResults([]);
      return;
    }

    setUserResults(data || []);
  }

  async function submitGrant(profile: ProfileRow) {
    if (actionBusy || !grantCoupon) return;
    setActionBusy(true);

    // 쓰기는 RPC 전용이다 — coupon_grants 에는 insert 정책이 없다(sql/55 1-h절).
    const { error } = await supabase.rpc("fn_grant_coupon", {
      p_coupon_id: grantCoupon.id,
      p_user_id: profile.id,
    });

    if (error) {
      setActionBusy(false);
      // GRANT_ERROR_TEXT 와 같은 명시적 분기 — VOID_ERROR_TEXT 주석 참고.
      console.error(error);
      alert(
        `등록 실패: ${error.code in GRANT_ERROR_TEXT ? GRANT_ERROR_TEXT[error.code] : ADMIN_UNKNOWN_ERROR_TEXT}`,
      );
      return;
    }

    alert("저장 완료");
    await loadGrants(grantCoupon.id);
    setActionBusy(false);
  }

  async function submitRevoke(row: GrantRow) {
    if (actionBusy) return;
    setActionBusy(true);

    // submitVoid와 같은 이유 — exactOptionalPropertyTypes 아래서 optional
    // 인자에 undefined를 명시할 수 없어 값이 없으면 키를 뺀다.
    const { error } = await supabase.rpc("fn_revoke_coupon_grant", {
      p_grant_id: row.id,
      ...(revokeReason.trim() ? { p_reason: revokeReason.trim() } : {}),
    });

    if (error) {
      setActionBusy(false);
      // GRANT_ERROR_TEXT 와 같은 명시적 분기 — VOID_ERROR_TEXT 주석 참고.
      console.error(error);
      alert(
        `수정 실패: ${error.code in GRANT_ERROR_TEXT ? GRANT_ERROR_TEXT[error.code] : ADMIN_UNKNOWN_ERROR_TEXT}`,
      );
      return;
    }

    setRevokingId(null);
    setRevokeReason("");
    alert("저장 완료");
    await loadGrants(row.coupon_id);
    setActionBusy(false);
  }

  // ── 목록 ────────────────────────────────────────────────────────────
  if (view === "list") {
    return (
      <>
        <div className="mb-6 bg-white px-6 py-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={loadList}
              className="inline-flex h-9 items-center gap-2 border border-gray-500 bg-white px-4 text-sm font-bold"
            >
              <RefreshCw size={14} />
              초기화
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4">
            <h1 className="text-xl font-black">{TITLE}</h1>

            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap bg-[#2348ff] px-4 text-sm font-black text-white"
            >
              <Plus size={14} />
              등록
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow-sm">
            데이터를 불러오는 중입니다.
          </div>
        ) : (
          <div className="bg-white p-6 shadow-sm">
            <div className="mb-4 text-sm font-bold text-gray-500">
              전체 <span className="text-blue-600">{coupons.length}</span>건
            </div>

            <ScrollArea axis="x">
              <table className="w-full min-w-285 border-collapse text-sm">
                <thead>
                  <tr className="border-y border-gray-300">
                    <th className="w-14 px-3 py-3 text-left">번호</th>
                    {[
                      "slug",
                      "title",
                      "kind",
                      "discount_amount",
                      "min_amount",
                      "valid_until",
                      "max_uses_per_user",
                      "max_redemptions",
                      "stackable",
                      "grant_type",
                      "grant_on_signup",
                      "used",
                      "is_active",
                    ].map((key) => (
                      <th key={key} className="px-3 py-3 text-left">
                        <FieldName k={key} />
                      </th>
                    ))}
                    {/* 관리 칼럼을 sticky 로 고정한다. 칼럼이 12개라 1440 이하에서
                        표가 컨테이너보다 넓어지는데(페이지 가로 스크롤은 0 이지만
                        표 안에서 잘린다), 액션이 오른쪽 끝에 있어 기본 화면에서
                        보이지 않으면 발급·이력 진입점이 없는 화면이 된다. */}
                    <th className="sticky right-0 w-28 bg-white px-3 py-3 text-center">
                      관리
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {coupons.length === 0 ? (
                    <tr>
                      <td
                        colSpan={15}
                        className="py-12 text-center text-gray-400"
                      >
                        등록된 데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    coupons.map((row, index) => {
                      const used = redemptionStats.byCoupon[row.id] || {
                        active: 0,
                        total: 0,
                      };

                      return (
                        <tr
                          key={row.id}
                          className={`border-b border-gray-100 ${
                            row.is_active ? "" : "bg-[#fafafa] text-gray-400"
                          }`}
                        >
                          <td className="px-3 py-3">{index + 1}</td>

                          {/* slug 단독으로 판단하지 않도록 금액을 같은 셀에 붙여
                              보여준다 — 'signup-6000' 이 실제로 2,000원이던
                              사고(sql/55 P1-2)가 여기서 반복되지 않게 하는 지점이다. */}
                          <td className="px-3 py-3">
                            <div className="font-mono text-[0.8125rem] font-bold">
                              {row.slug}
                            </div>
                            <div className="text-xs font-bold text-blue-600">
                              {moneyText(row.discount_amount)}
                            </div>
                            {row.code && (
                              <div className="font-mono text-xs text-gray-500">
                                {row.code}
                              </div>
                            )}
                          </td>

                          <td className="px-3 py-3">{row.title}</td>
                          {/* 파생 칼럼(DB 컬럼 아님) — tenant_id 가 있으면 단체,
                              없고 code+총 발행 수량 1이면 선물, 그 외 할인
                              (2026-08-27 org_code 기준 결정, 2026-09-22
                              tenant_id 로 축 전환. 세 종류를 한눈에 구분). */}
                          <td className="px-3 py-3">
                            {row.tenant_id
                              ? "단체"
                              : row.code && row.max_redemptions === 1
                                ? "선물"
                                : "할인"}
                          </td>
                          <td className="px-3 py-3">
                            {moneyText(row.discount_amount)}
                          </td>
                          <td className="px-3 py-3">
                            {moneyText(row.min_amount)}
                          </td>
                          <td className="px-3 py-3">
                            {row.valid_until ??
                              UNLIMITED_LABEL ??
                              UNLIMITED_FALLBACK}
                          </td>
                          <td className="px-3 py-3">
                            {nullableText(row.max_uses_per_user)}
                          </td>
                          <td className="px-3 py-3">
                            {nullableText(row.max_redemptions)}
                          </td>
                          <td className="px-3 py-3">
                            {flagMark(row.stackable)}
                          </td>

                          {/* 표시는 GRANT_TYPE_LABEL(승인된 한국어 라벨) — DB 값
                              auto/granted 는 이 칼럼에 노출하지 않는다. 폼의 라디오도
                              같은 매핑을 쓰므로 화면 사이에서 말이 바뀌지 않는다. */}
                          <td className="px-3 py-3">
                            {GRANT_TYPE_LABEL[row.grant_type] ?? row.grant_type}
                          </td>
                          <td className="px-3 py-3">
                            {flagMark(row.grant_on_signup)}
                          </td>

                          {/* 유효 건수 / 전체 건수(무효화 포함)를 둘 다 보여준다 —
                              void 한 이력이 사라지지 않는 것이 이 도메인의 원칙이라
                              전체만 보이면 "왜 소진인데 쓸 수 있나" 를, 유효만 보이면
                              "되돌린 기록" 을 각각 놓친다. */}
                          <td className="px-3 py-3 font-mono text-[0.8125rem]">
                            {used.active} / {used.total}
                            {redemptionStats.truncated && "+"}
                          </td>

                          <td className="px-3 py-3">
                            {boolText(row.is_active)}
                          </td>

                          <td
                            className={`sticky right-0 px-3 py-3 ${
                              row.is_active ? "bg-white" : "bg-[#fafafa]"
                            }`}
                          >
                            <div className="flex justify-center gap-3">
                              {/* 수정 아이콘은 AdminTable(:4674)의 기존 액션과
                                  같은 아이콘·같은 무라벨 규범을 그대로 따른다. */}
                              <button
                                type="button"
                                onClick={() => openEdit(row)}
                                className="text-gray-500 hover:text-black"
                              >
                                <Edit3 size={17} />
                              </button>

                              <button
                                type="button"
                                onClick={() => openHistory(row)}
                                aria-label={HISTORY_ACTION_LABEL ?? undefined}
                                className="text-gray-500 hover:text-blue-600"
                              >
                                <History size={17} />
                              </button>

                              {/* 발급 관리는 발급형이거나(신규 발급 가능), 과거에
                                  조건형으로 전환된 뒤에도 살아있는(회수 안 된)
                                  발급 이력이 남아 있으면 보여준다 — 전환된 쿠폰의
                                  이력 접근을 끊지 않는다(요구사항 ⑥). 둘 다
                                  아니면 "눌렀는데 아무도 없는" 빈 화면이거나,
                                  발급 시 WC004 로만 실패하는 버튼이 된다 — 아예
                                  그리지 않는다. */}
                              {(row.grant_type === "granted" ||
                                grantedCouponIds.has(row.id)) && (
                                <button
                                  type="button"
                                  onClick={() => openGrants(row)}
                                  aria-label={GRANTS_ACTION_LABEL ?? undefined}
                                  className="text-gray-500 hover:text-blue-600"
                                >
                                  <Users size={17} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </ScrollArea>
          </div>
        )}
      </>
    );
  }

  // ── 사용이력 ────────────────────────────────────────────────────────
  if (view === "history") {
    return (
      <>
        <div className="mb-6 bg-white px-6 py-5 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setView("list");
                setHistoryCoupon(null);
              }}
              aria-label={BACK_ACTION_LABEL ?? undefined}
              className="inline-flex h-9 w-9 items-center justify-center border border-gray-500 bg-white"
            >
              <ChevronLeft size={15} />
            </button>

            <h1 className="text-xl font-black">{TITLE}</h1>
          </div>

          {/* 어느 쿠폰의 이력인지 — 값(데이터)만으로 식별한다. */}
          {historyCoupon && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold">
              <span className="font-mono text-[0.8125rem]">
                {historyCoupon.slug}
              </span>
              <span>{historyCoupon.title}</span>
              <span className="text-blue-600">
                {moneyText(historyCoupon.discount_amount)}
              </span>
              <span className="text-gray-500">
                {boolText(historyCoupon.is_active)}
              </span>
            </div>
          )}
        </div>

        {historyLoading ? (
          <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow-sm">
            데이터를 불러오는 중입니다.
          </div>
        ) : (
          <div className="bg-white p-6 shadow-sm">
            <div className="mb-4 text-sm font-bold text-gray-500">
              전체 <span className="text-blue-600">{historyRows.length}</span>건
            </div>

            <ScrollArea axis="x">
              <table className="w-full min-w-250 border-collapse text-sm">
                <thead>
                  <tr className="border-y border-gray-300">
                    <th className="w-14 px-3 py-3 text-left">번호</th>
                    {[
                      "order_id",
                      "user",
                      "discount_amount",
                      "created_at",
                      "voided_at",
                      "void_reason",
                    ].map((key) => (
                      <th key={key} className="px-3 py-3 text-left">
                        <FieldName k={key} />
                      </th>
                    ))}
                    <th className="w-24 px-3 py-3 text-center">관리</th>
                  </tr>
                </thead>

                <tbody>
                  {historyRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-12 text-center text-gray-400"
                      >
                        등록된 데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    historyRows.map((row, index) => {
                      const profile = row.user_id
                        ? historyProfiles[row.user_id]
                        : null;
                      const voided = row.voided_at !== null;

                      return (
                        <tr
                          key={row.id}
                          className={`border-b border-gray-100 ${voided ? "text-gray-400" : ""}`}
                        >
                          <td className="px-3 py-3">
                            {historyRows.length - index}
                          </td>

                          <td className="px-3 py-3 font-mono text-xs">
                            {row.order_id}
                          </td>

                          <td className="px-3 py-3">
                            {row.user_id ? (
                              <>
                                <div className="font-bold">
                                  {profile?.name || profile?.email || "-"}
                                </div>
                                <div className="font-mono text-xs text-gray-500">
                                  {row.user_id}
                                </div>
                              </>
                            ) : (
                              "-"
                            )}
                          </td>

                          <td className="px-3 py-3">
                            {moneyText(row.discount_amount)}
                          </td>
                          <td className="px-3 py-3">
                            {dateTimeText(row.created_at)}
                          </td>
                          <td className="px-3 py-3">
                            {dateTimeText(row.voided_at)}
                          </td>
                          <td className="px-3 py-3">
                            {row.void_reason || "-"}
                          </td>

                          <td className="px-3 py-3">
                            {voided ? (
                              <div className="text-center text-gray-300">-</div>
                            ) : voidingId === row.id ? (
                              // 2단계 액션. 확인 문구(window.confirm)를 쓰려면 새
                              // 한국어 문구가 필요한데 '정말 삭제하시겠습니까?' 는
                              // void 가 삭제가 아니라서 거짓말이 된다. 대신 사유
                              // 입력을 한 단계 끼워 오조작을 구조로 막는다.
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={voidReason}
                                  placeholder={
                                    VOID_REASON_PLACEHOLDER ?? undefined
                                  }
                                  onChange={(e) =>
                                    setVoidReason(e.target.value)
                                  }
                                  className={`${INPUT_CLASS} w-48`}
                                />
                                <button
                                  type="button"
                                  onClick={() => submitVoid(row)}
                                  disabled={actionBusy}
                                  className="text-red-600 hover:text-red-800 disabled:opacity-40"
                                >
                                  <Check size={17} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVoidingId(null);
                                    setVoidReason("");
                                  }}
                                  className="text-gray-500 hover:text-black"
                                >
                                  <X size={17} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVoidingId(row.id);
                                    setVoidReason("");
                                  }}
                                  aria-label={VOID_ACTION_LABEL ?? undefined}
                                  className="text-gray-500 hover:text-red-600"
                                >
                                  <Ban size={17} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </ScrollArea>
          </div>
        )}
      </>
    );
  }

  // ── 발급 관리 ────────────────────────────────────────────────────────
  if (view === "grants") {
    return (
      <>
        <div className="mb-6 bg-white px-6 py-5 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setView("list");
                setGrantCoupon(null);
              }}
              aria-label={BACK_ACTION_LABEL ?? undefined}
              className="inline-flex h-9 w-9 items-center justify-center border border-gray-500 bg-white"
            >
              <ChevronLeft size={15} />
            </button>

            <h1 className="text-xl font-black">{TITLE}</h1>
          </div>

          {/* 어느 쿠폰의 발급인지 — 사용이력 헤더와 같은 형태. valid_until 을
              함께 보여준다: 발급받아도 쿠폰 자신의 기한이 지나면 못 쓰기
              때문이다. 발급분에도 별도 기한이 있고(coupon_grants.valid_until,
              20260825000010) 그건 아래 목록의 「사용 기한」 칼럼이다 — 실제로
              쓸 수 있는 마지막 날은 이 둘 중 이른 쪽이다. */}
          {grantCoupon && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold">
              <span className="font-mono text-[0.8125rem]">
                {grantCoupon.slug}
              </span>
              <span>{grantCoupon.title}</span>
              <span className="text-blue-600">
                {moneyText(grantCoupon.discount_amount)}
              </span>
              <span className="text-gray-500">
                {grantCoupon.valid_until ??
                  UNLIMITED_LABEL ??
                  UNLIMITED_FALLBACK}
              </span>
              <span className="text-gray-500">
                {boolText(grantCoupon.is_active)}
              </span>
            </div>
          )}
        </div>

        {/* 개별 발급 — 사용자를 찾아서 준다. 이메일·이름 검색은 profiles 를
            직접 조회한다(profiles_admin_select_all 정책). 발급 자체는 RPC 다. */}
        <div className="mb-6 bg-white p-6 shadow-sm">
          <div className="mb-3 text-sm font-black">
            <FieldName k="email" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="w-[20rem] max-w-full">
              <input
                type="text"
                value={userQuery}
                placeholder={USER_SEARCH_PLACEHOLDER ?? undefined}
                onChange={(e) => setUserQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") searchUsers();
                }}
                className={INPUT_CLASS}
              />
            </span>
            <button
              type="button"
              onClick={searchUsers}
              className="inline-flex h-9 items-center gap-2 border border-gray-500 bg-white px-4 text-sm font-bold"
            >
              <Search size={14} />
              조회
            </button>
          </div>

          {userSearching && (
            <div className="mt-4 text-sm font-bold text-gray-500">
              데이터를 불러오는 중입니다.
            </div>
          )}

          {!userSearching && userResults !== null && (
            <div className="mt-4 border-t border-gray-200">
              {userResults.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-400">
                  등록된 데이터가 없습니다.
                </div>
              ) : (
                userResults.map((profile) => {
                  const already = grantedUserIds.has(profile.id);

                  return (
                    <div
                      key={profile.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 py-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-bold">
                          {profile.name || "-"}
                        </div>
                        <div className="font-mono text-xs text-gray-500">
                          {profile.email}
                        </div>
                      </div>

                      {already ? (
                        // 이미 살아있는 발급이 있으면 버튼 대신 상태 표시만 둔다.
                        <span
                          className="text-green-600"
                          title={ALREADY_GRANTED_TEXT ?? undefined}
                          role="img"
                          aria-label={ALREADY_GRANTED_TEXT ?? undefined}
                        >
                          <Check size={17} />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => submitGrant(profile)}
                          disabled={actionBusy}
                          className="inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap bg-[#2348ff] px-4 text-sm font-black text-white disabled:opacity-50"
                        >
                          <Plus size={14} />
                          등록
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {grantLoading ? (
          <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow-sm">
            데이터를 불러오는 중입니다.
          </div>
        ) : (
          <div className="bg-white p-6 shadow-sm">
            <div className="mb-4 text-sm font-bold text-gray-500">
              전체 <span className="text-blue-600">{grantRows.length}</span>건
            </div>

            <ScrollArea axis="x">
              <table className="w-full min-w-250 border-collapse text-sm">
                <thead>
                  <tr className="border-y border-gray-300">
                    <th className="w-14 px-3 py-3 text-left">번호</th>
                    {[
                      "user",
                      "granted_by",
                      "granted_at",
                      "valid_until",
                      "revoked_at",
                      "revoke_reason",
                    ].map((key) => (
                      <th key={key} className="px-3 py-3 text-left">
                        <FieldName k={key} />
                      </th>
                    ))}
                    <th className="w-24 px-3 py-3 text-center">관리</th>
                  </tr>
                </thead>

                <tbody>
                  {grantRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-12 text-center text-gray-400"
                      >
                        등록된 데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    grantRows.map((row, index) => {
                      const profile = grantProfiles[row.user_id];
                      const revoked = row.revoked_at !== null;

                      return (
                        <tr
                          key={row.id}
                          className={`border-b border-gray-100 ${revoked ? "text-gray-400" : ""}`}
                        >
                          <td className="px-3 py-3">
                            {grantRows.length - index}
                          </td>

                          <td className="px-3 py-3">
                            <div className="font-bold">
                              {profile?.name || profile?.email || "-"}
                            </div>
                            <div className="font-mono text-xs text-gray-500">
                              {row.user_id}
                            </div>
                          </td>

                          <td className="px-3 py-3 font-mono text-[0.8125rem]">
                            {row.granted_by}
                          </td>
                          <td className="px-3 py-3">
                            {dateTimeText(row.granted_at)}
                          </td>
                          {/* 쿠폰 자신의 기한(위 헤더)과 별개 축이다 — 실제로
                              쓸 수 있는 마지막 날은 둘 중 이른 쪽이다. */}
                          <td className="px-3 py-3">
                            {row.valid_until ?? UNLIMITED_LABEL}
                          </td>
                          <td className="px-3 py-3">
                            {dateTimeText(row.revoked_at)}
                          </td>
                          <td className="px-3 py-3">
                            {row.revoke_reason || "-"}
                          </td>

                          <td className="px-3 py-3">
                            {revoked ? (
                              // 회수된 행은 사라지지 않는다(원장). 다시 회수할 수도
                              // 없다 — 되돌리려면 "다시 발급"(새 행)이다.
                              <div className="text-center text-gray-300">-</div>
                            ) : revokingId === row.id ? (
                              // void 와 같은 2단계 게이트. window.confirm 을 쓰면
                              // 새 한국어 문구가 필요해진다.
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={revokeReason}
                                  placeholder={
                                    REVOKE_REASON_PLACEHOLDER ?? undefined
                                  }
                                  onChange={(e) =>
                                    setRevokeReason(e.target.value)
                                  }
                                  className={`${INPUT_CLASS} w-48`}
                                />
                                <button
                                  type="button"
                                  onClick={() => submitRevoke(row)}
                                  disabled={actionBusy}
                                  className="text-red-600 hover:text-red-800 disabled:opacity-40"
                                >
                                  <Check size={17} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRevokingId(null);
                                    setRevokeReason("");
                                  }}
                                  className="text-gray-500 hover:text-black"
                                >
                                  <X size={17} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRevokingId(row.id);
                                    setRevokeReason("");
                                  }}
                                  aria-label={REVOKE_ACTION_LABEL ?? undefined}
                                  className="text-gray-500 hover:text-red-600"
                                >
                                  <Ban size={17} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </ScrollArea>
          </div>
        )}
      </>
    );
  }

  // ── 생성 · 수정 ──────────────────────────────────────────────────────
  const editingRow =
    view === "edit" ? coupons.find((row) => row.id === editingId) : null;

  return (
    <div>
      <h1 className="mb-5 text-2xl font-black text-[#111827]">
        {TITLE} {view === "create" ? "등록" : "수정"}
      </h1>

      <div className="bg-white shadow-sm">
        {editingRow && (
          <div className="grid grid-cols-[13.75rem_1fr] border-b border-[#edf0f4]">
            <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">
              <FieldName k="id" />
            </div>
            <div className="px-5 py-3 font-mono text-xs">
              {editingRow.id}
              <span className="ml-3 font-sans text-xs font-bold text-gray-500">
                {dateTimeText(editingRow.created_at)}
              </span>
            </div>
          </div>
        )}

        {FORM_KEYS.map((key) => (
          <div
            key={key}
            className="grid grid-cols-[13.75rem_1fr] border-b border-[#edf0f4]"
          >
            <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">
              <FieldName k={key} />
              {/* 필수 표시는 AdminForm 과 같은 규범(빨간 별표). NULL 을 고를 수
                  있는 3필드도 "선택 자체" 가 필수다 — 비워둘 수 없다. code 는
                  비워도 되고(코드 없는 쿠폰), stackable 은 불리언이라 항상 값이
                  있다(기본 false), tenant_id 는 비우면(소속 없음) 소속 제한
                  없음(2026-08-27 org_code 기준 결정, 2026-09-22 축 전환)
                  — 셋만 별표가 없다. */}
              {key !== "code" &&
                key !== "tenant_id" &&
                key !== "stackable" &&
                key !== "grant_on_signup" && (
                  <span className="ml-1 text-red-500">*</span>
                )}
            </div>

            <div className="px-5 py-3">
              {key === "is_active" && (
                <div className="flex items-center gap-6">
                  <label className="inline-flex items-center gap-2 text-sm font-bold">
                    <input
                      type="radio"
                      name="is_active"
                      checked={form.is_active === true}
                      onChange={() => patch({ is_active: true })}
                    />
                    사용
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm font-bold">
                    <input
                      type="radio"
                      name="is_active"
                      checked={form.is_active === false}
                      onChange={() => patch({ is_active: false })}
                    />
                    미사용
                  </label>
                </div>
              )}

              {key === "stackable" && (
                // 불리언이지만 '사용/미사용' 의미가 아니라(결합 가능 여부) 그
                // 문구를 재사용하면 거짓말이 된다 — 라벨 없는 체크박스로 둔다.
                // 기본은 배타(false)다: sql/55 0-c절.
                <input
                  type="checkbox"
                  checked={form.stackable === true}
                  onChange={(e) => patch({ stackable: e.target.checked })}
                />
              )}

              {key === "grant_type" && (
                // 라벨은 GRANT_TYPE_LABEL(승인된 한국어) — value(라디오가 실제로
                // 들고 있는 값)는 GRANT_TYPES 의 영문 그대로다. 저장 시에는
                // form.grant_type(영문)이 그대로 payload 로 나간다(formToPayload).
                <div className="flex items-center gap-6">
                  {GRANT_TYPES.map((value) => (
                    <label
                      key={value}
                      className="inline-flex items-center gap-2 text-sm font-bold"
                    >
                      <input
                        type="radio"
                        name="grant_type"
                        checked={form.grant_type === value}
                        onChange={() =>
                          patch(
                            // sql/70 coupons_cap_derived_from_grant_type_check —
                            // 1인당 사용 횟수는 grant_type 의 파생값이라 여기서
                            // 같이 확정한다(2026-08-12, 사용자 지시). 조건형으로
                            // 되돌리면 grant_on_signup 도 함께 끈다 —
                            // coupons_grant_on_signup_check 가 그 조합을 금지한다.
                            value === "granted"
                              ? {
                                  grant_type: value,
                                  max_uses_per_user_mode: "value",
                                  max_uses_per_user: 1,
                                }
                              : {
                                  grant_type: value,
                                  grant_on_signup: false,
                                  max_uses_per_user_mode: "unlimited",
                                  max_uses_per_user: "",
                                },
                          )
                        }
                      />
                      <span>{GRANT_TYPE_LABEL[value] ?? value}</span>
                    </label>
                  ))}
                </div>
              )}

              {key === "grant_on_signup" && (
                // stackable 과 같은 라벨 없는 체크박스. 발급형이 아니면 켤 수
                // 없으므로(DB CHECK) 비활성화한다 — "켰는데 저장이 23514 로
                // 실패하는" 화면을 만들지 않는다.
                <input
                  type="checkbox"
                  checked={form.grant_on_signup === true}
                  disabled={form.grant_type !== "granted"}
                  onChange={(e) => patch({ grant_on_signup: e.target.checked })}
                />
              )}

              {key === "slug" && (
                <>
                  <input
                    type="text"
                    value={form.slug}
                    onChange={(e) => patch({ slug: e.target.value })}
                    className={`${INPUT_CLASS} font-mono ${
                      slugConflict ? "border-red-500" : ""
                    }`}
                  />
                  {slugConflict && (
                    // 문구를 지어내지 않고 "충돌한 기존 쿠폰 행" 을 그대로 보여준다.
                    <div className="mt-2 border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold">
                      {SLUG_DUPLICATE_TEXT && (
                        <div className="mb-1 text-red-600">
                          {SLUG_DUPLICATE_TEXT}
                        </div>
                      )}
                      <span className="font-mono">{slugConflict.slug}</span>
                      <span className="mx-2">{slugConflict.title}</span>
                      <span className="text-blue-600">
                        {moneyText(slugConflict.discount_amount)}
                      </span>
                      <span className="ml-2 text-gray-500">
                        {boolText(slugConflict.is_active)}
                      </span>
                    </div>
                  )}
                </>
              )}

              {key === "title" && (
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => patch({ title: e.target.value })}
                  className={INPUT_CLASS}
                />
              )}

              {key === "code" && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={form.code}
                      onChange={(e) => patch({ code: e.target.value })}
                      className={`${INPUT_CLASS} font-mono`}
                    />
                    <button
                      type="button"
                      onClick={applyGiftCodePreset}
                      className="h-9 shrink-0 whitespace-nowrap border border-gray-500 bg-white px-3 text-sm font-bold"
                    >
                      선물 쿠폰 코드 생성
                    </button>
                  </div>
                  <span className="text-xs font-bold text-gray-500">
                    {GIFT_CODE_PRESET_HINT_TEXT}
                  </span>
                </div>
              )}

              {key === "tenant_id" && (
                <div className="flex flex-col gap-2">
                  <select
                    value={form.tenant_id}
                    onChange={(e) => patch({ tenant_id: e.target.value })}
                    className={INPUT_CLASS}
                  >
                    <option value="">소속 없음</option>
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs font-bold text-gray-500">
                    {ORG_CODE_HELPER_TEXT}
                  </span>
                </div>
              )}

              {(key === "discount_amount" || key === "min_amount") && (
                <div className="flex items-center gap-3">
                  <span className="w-40">
                    <input
                      type="number"
                      min={key === "discount_amount" ? 1 : 0}
                      value={form[key]}
                      onChange={(e) =>
                        patch({ [key]: e.target.value.replace(/[^0-9]/g, "") })
                      }
                      className={INPUT_CLASS}
                    />
                  </span>
                  {/* 금액을 사람이 읽는 형태로 함께 보여준다 — 자릿수 오입력
                      (2,000 ↔ 20,000)이 이 도메인의 실제 사고 유형이었다. */}
                  <span className="text-sm font-bold text-blue-600">
                    {moneyText(form[key] === "" ? 0 : form[key])}
                  </span>
                </div>
              )}

              {NULLABLE_KEYS.includes(key) && (
                <NullableField
                  fieldKey={key}
                  type={key === "valid_until" ? "date" : "number"}
                  mode={form[`${key}_mode`]}
                  // NULLABLE_KEYS(valid_until/max_uses_per_user/max_redemptions)는
                  // 항상 string|number 필드다 — boolean 필드는 이 목록에 없다.
                  value={form[key] as string | number}
                  onChange={patch}
                  // sql/70 이후 max_uses_per_user 는 grant_type 의 파생값이라
                  // (라디오 onChange 가 이미 확정) 손편집을 막는다 — 항상 잠금.
                  disabled={key === "max_uses_per_user"}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={closeForm}
          className="h-10 bg-[#4b5563] px-5 text-sm font-black text-white"
        >
          취소
        </button>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="h-10 bg-[#2348ff] px-5 text-sm font-black text-white disabled:opacity-50"
        >
          저장
        </button>
      </div>
    </div>
  );
}
