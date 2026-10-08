// 이용권(유료 서비스 접근) 판정 — 서버가 유일한 정본이다.
//
// 판정에 쓰는 소스는 두 곳이다: program_access(사실은 DB 함수
// public.fn_program_access_state 경유, sql/64 10)절 — 아래 checkProgramAccessTable
// 참고), enrollments(오프라인 수강, sql/61_offline_enrollment_consolidation.sql).
// orders는 보지 않는다 — orders는 결제 시도/완료 기록이고, "지금 서비스를
// 쓸 수 있는가"는 위 두 소스로만 정해진다. 클라이언트가 orders를 직접 조회해
// 이 규칙을 다시 구현하면(과거 한 차례 그랬다) 서버와 반드시 어긋난다 —
// orders만 있고 program_access/enrollments가 없는 사용자, 혹은 그 반대인
// 사용자가 생기면 양쪽 판정이 갈린다. 그래서 판정 로직은 여기 한 곳에만
// 두고, api/create-service-ticket.js(SSO 티켓 발급), api/check-service-access.js
// (클라이언트 조회용, 읽기 전용), api/_lib/goal/repo.ts(목표관리 서버 라우트의
// 세션 게이트)가 함께 쓴다.
//
// target_url·SSO_SECRET·티켓 서명처럼 "티켓 발급" 전용 로직은 여기 없다.
// 그건 api/create-service-ticket.js에 남아 있다 — 접근 판정과는 관심사가
// 다르다(check-service-access.js는 target_url/SSO_SECRET을 아예 요구하지
// 않는다).

import type { IncomingHttpHeaders } from "node:http";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ServiceConfig = {
  service_key: string;
  service_name: string;
  target_url?: string | undefined;
  payment_keywords: string[];
  program_keys: string[];
};

export const SERVICE_CONFIGS: Record<string, ServiceConfig> = {
  suhaeng: {
    service_key: "suhaeng",
    service_name: "AI 수행평가 서비스",
    // target_url(SUHAENG_SERVICE_URL) 폐기(인앱 전환, 2026-08-13) — 수행평가는
    // 더 이상 외부 앱으로 SSO 티켓 발급・리다이렉트하지 않는다
    // (api/create-service-ticket.js의 suhaeng 조기 분기 참고). 이 config 자체는
    // 계속 쓴다 — payment_keywords/program_keys는 hasPaidServiceAccess 판정
    // (check-service-access.js, RequireEntitlement 가드 경로)이 그대로 참조한다.
    payment_keywords: ["수행", "수행평가", "AI 수행평가", "세특팅"],
    program_keys: ["suhaeng"],
  },
  goal: {
    service_key: "goal",
    service_name: "목표관리 서비스",
    target_url: process.env.GOAL_SERVICE_URL || process.env.TARGET_SERVICE_URL,
    payment_keywords: [
      "목표",
      "목표관리",
      "목표 관리",
      "학습관리",
      "학습 관리",
    ],
    // program_keys 는 fn_program_access_state 에 넘길 후보다. 예전엔
    // ['goal', 'target'] 두 값을 다 받아줬다 — products.service_key='goal'
    // 이 program_key로도 그대로 쓰이던 시절의 흔적인데, DB 에 관계가 없어
    // dev 가 실제로 'goal' 로 어긋나 있었다(sql/54_program_access_grant.sql
    // "goal → target 전환" 절). 지금은 sql/60_product_program_relation.sql
    // 이 products.program_key 로 이 관계를 못박아 grantProgramAccessForOrder
    // (api/_lib/programAccess.js)가 goal 상품 결제 시 항상 program_key=
    // 'target' 으로만 쓴다 — 'goal' 로 쓰는 코드 경로가 이제 하나도 없다.
    // 운영 DB(ucjlcvqvinspmrasvsug) 확인상 program_access.program_key=
    // 'goal' 인 행도 이미 없었다(target 2건만 실재, sql/54 동일 절) — 이
    // 관용을 좁혀도 기존 사용자의 앱 진입이 끊기지 않는다(2026-08-11).
    program_keys: ["target"],
  },
  // 학습진단(이용 요금 구조 최종본 20260806) — 유료 전환. 회원가입 시 1회 무료는
  // 이 config가 관여하지 않는 별도 판정이다(diagnosis_attempts kind='free',
  // api/diagnosis/access.ts·consume.ts 참고) — hasPaidServiceAccess는 "무료 1회
  // 이후" 이용권만 본다. products.program_key='diagnose'(sql/60 관계, session_quota
  // 1)와 1:1 대응.
  diagnose: {
    service_key: "diagnose",
    service_name: "학습진단 서비스",
    payment_keywords: ["진단", "학습진단"],
    program_keys: ["diagnose"],
  },
  // 성장설계. programs.program_key 'growth'(20261006035354) 와 consume_growth_credit 의 c_program_key 와 같은 값.
  growth: {
    service_key: "growth",
    service_name: "위닝 성장설계",
    payment_keywords: ["성장설계"],
    program_keys: ["growth"],
  },
  // 자기평가서. programs.program_key 'selfeval' 과 consume_selfeval_credit 의 c_program_key 와 같은 값.
  selfeval: {
    service_key: "selfeval",
    service_name: "위닝 자기평가서",
    payment_keywords: ["자기평가서"],
    program_keys: ["selfeval"],
  },
  // 심화탐구. programs.program_key 'inquiry'(20261006111510) 와 consume_inquiry_credit 의 c_program_key 와 같은 값.
  inquiry: {
    service_key: "inquiry",
    service_name: "위닝 심화탐구",
    payment_keywords: ["심화탐구", "심화 탐구"],
    program_keys: ["inquiry"],
  },
};

export function clean(value: unknown): string {
  return String(value || "").trim();
}

function normalizeStatus(value: unknown): string {
  return clean(value).toLowerCase().replace(/\s/g, "");
}

// enrollments(오프라인 수강) 경로 전용 상태 판정.
//
// program_access 경로는 2026-08-12 부터 이 문자열 판정을 쓰지 않는다 —
// sql/64 10)절 public.fn_program_access_state 가 payment_status·access_status·
// 기간 만료를 한 곳에서 판정한다(아래 checkProgramAccessTable 참고). 여기 남은
// 판정은 enrollments.payment_status 하나뿐인데, 그 컬럼은 어드민이 한국어로
// 자유 입력하는 값이라 CHECK 어휘로 좁힐 수 없어 부분일치 판정이 계속 필요하다.
//
// 부정 상태를 먼저 끊는다 — 판정이 includes(부분일치)라서 그냥 두면
// 'unpaid'.includes('paid') 가 true 가 되어 미납이 결제완료로 통과하고,
// 한글도 '완납예정'.includes('완납'), '결제완료취소'.includes('결제완료'),
// '이용중지'.includes('이용중') 처럼 부정 상태가 긍정으로 잘못 읽힌다.
//
// 2026-08-12 service-access-unify 작업 중 이 목록이 영문 5개 + 한글 4개로
// 좁아져 있던 걸 발견했다(#59 PR 병합 충돌 해소 때 create-service-ticket.js
// 를 인라인화하면서 원래 16개짜리 한글 부정 신호 목록이 실수로 줄었다).
// 원 설계 의도(git show origin/dev:api/_lib/serviceAccess.js 의
// NEGATIVE_STATUS_SIGNALS, dev@eba4c2d 기준)로 복원한다 — 게이트는
// fail-closed 여야 하고, enrollments.payment_status 는 어드민 자유 입력이라
// 부정 신호를 넓게 잡아야 '완납예정'·'이용중지' 같은 함정을 막는다.
//
// '대기'도 그대로 유지한다. enrollments.payment_status 는 orders.status 와
// 별개인 오프라인 수기 입력 축이라 '입금대기'류 표기가 실제로 들어올 수
// 있는데, 대기 상태는 결제완료가 아니므로 거부가 맞는 판정이다(기본값이
// 결제완료로 읽히면 안 된다는 게 원래 의도이기도 하다).
export const DENIED_PAYMENT_STATUSES: string[] = [
  "unpaid",
  "refunded",
  "refund",
  "cancelled",
  "canceled",
  "미납",
  "미결제",
  "환불",
  "취소",
  "만료",
  "중지",
  "정지",
  "대기",
  "보류",
  "해지",
  "실패",
  "거절",
  "반려",
  "예정",
  "비활성",
  "비정상",
];

export function isPaidStatus(value: unknown): boolean {
  const status = normalizeStatus(value);
  if (DENIED_PAYMENT_STATUSES.some((item) => status.includes(item)))
    return false;
  return [
    "paid",
    "active",
    "완납",
    "납부완료",
    "결제완료",
    "결제완료됨",
    "결제완료/이용중",
    "이용중",
  ].some((item) => status.includes(item));
}

// program_access.access_status는 CHECK 제약으로 영문 enum이 강제된다
// (inactive/active/expired/suspended). findProgramAccessRow()의 statusRank가
// isPaidStatus와 함께 이 함수로 "유효한 행"을 가른다 — service-access-unify
// 작업(290160d) 때 게이트(checkProgramAccessTable)가 fn_program_access_state
// RPC로 옮겨가며 이 함수가 삭제됐는데, findProgramAccessRow는 여전히 이걸
// 참조하고 있어 program_access 행이 2건 이상인 사용자에서 ReferenceError로
// 죽었다(statusRank 비교자 실행 시점).
//
// 영문은 정확 일치만 인정한다(isPaidStatus와 동일 이유) — 'inactive'는
// DENIED_PAYMENT_STATUSES에 단어로 없어서 includes('active')로 걸면
// 'inactive'.includes('active') === true 로 비활성이 활성으로 오판된다.
export function isActiveStatus(value: unknown): boolean {
  const status = normalizeStatus(value);
  if (status === "active") return true;
  if (["inactive", "expired", "suspended"].includes(status)) return false;
  if (DENIED_PAYMENT_STATUSES.some((item) => status.includes(item)))
    return false;
  return ["활성", "사용중", "이용중", "정상"].some((item) =>
    status.includes(item),
  );
}

/**
 * Authorization: Bearer <token> 헤더에서 토큰만 뽑는다.
 *
 * `VercelRequest`(headers: IncomingHttpHeaders)를 캐스팅 없이 그대로 받을 수
 * 있도록 `Record<string, string>` 대신 `IncomingHttpHeaders`를 받는다 — 값이
 * 배열일 수 있는 헤더(중복 지정 등)는 첫 요소를 쓴다. 대소문자·"Bearer " 접두
 * 처리 등 기존 동작은 그대로다.
 */
export function getBearerToken(req: { headers: IncomingHttpHeaders }): string {
  const raw = req.headers.authorization;
  const header = Array.isArray(raw) ? raw[0] : raw;
  return clean(header || "").replace(/^Bearer\s+/i, "");
}

// 입장 판정. 정본은 DB 함수 하나다 — sql/64 10)절
// public.fn_program_access_state(profile_id, program_keys[]).
//
// 왜 SQL 함수로 옮겼는가 (감사 결과 M1)
//   예전 이 함수는 payment_status·access_status 두 컬럼만 읽었다. 즉 **기간
//   만료를 집행하는 코드가 이 저장소에 하나도 없었다** — 1개월권을 산 사람이
//   3년 뒤에도 들어갔다. 만료 판정은 "저장된 만료값 < now()" 라는 시각 비교라
//   DB 에서 하는 것이 맞고(자동 만료 cron 이 없어 판정 시점 계산이 유일한
//   집행 수단이다), 같은 계산을 배포된 소비 함수
//   (public.consume_performance_credit)도 하고 있어 식이 갈리면 게이트와 차감이
//   서로 다른 진실을 갖는다.
//
// 왜 3컬럼(id/user_id/profile_id) 순회를 없앴는가 (M15)
//   sql/64 4)절 program_access_identity_equality_check 가 세 컬럼의 등호를
//   강제하므로 id 단일 조회가 3컬럼 OR 와 **동치임이 제약으로 증명된다.**
//   그리고 PK 가 (id, program_key) 라 program_key 당 최대 1행이다 — 예전
//   구현의 .maybeSingle() 이 다행에서 PGRST116 을 내고 그 에러를
//   `if (error) continue` 가 삼켜 정상 결제자가 로그 0줄로 403 을 맞던 경로가
//   구조적으로 사라진다.
//
// 회차는 여기서 보지 않는다
//   게이트는 기간만 본다. 회차 차감·소진 판정은 소비 지점(배포된
//   consume_performance_credit)이 한다 — "회차 0 + 기간 유효" 상태의 입장
//   허용 여부는 확정 정책에 없는 미결 항목이라, 게이트를 기간 전용으로 두어
//   현행 동작을 바꾸지 않는다.
type ProgramAccessStateRow = {
  allowed: boolean;
  program_key: string;
  reason: string | null;
  expires_at: string | null;
};

export async function checkProgramAccessTable(
  supabaseAdmin: SupabaseClient,
  userId: string,
  config: ServiceConfig,
): Promise<{ allowed: boolean; reason: string | null }> {
  const { data, error } = await supabaseAdmin.rpc("fn_program_access_state", {
    p_profile_id: userId,
    p_program_keys: config.program_keys,
  });

  if (error) {
    // 에러를 삼키지 않는다. 예전 `if (error) continue` 는 판정 실패를 "권한
    // 없음"과 구별하지 않아, 결제자가 로그 한 줄 없이 403 을 맞았다. 로그를
    // 남기고 fail-closed 한다 — 판정할 수 없으면 열지 않는다(돈이 걸린 판단은
    // 되돌릴 수 있는 쪽으로).
    console.error(
      "fn_program_access_state 호출 실패:",
      config.service_key,
      userId,
      error,
    );
    return { allowed: false, reason: null };
  }

  const rows: ProgramAccessStateRow[] = Array.isArray(data) ? data : [];
  if (rows.some((row) => row.allowed === true))
    return { allowed: true, reason: null };

  // 거부 사유를 남긴다. 만료(period_expired)와 미결제(not_paid)는 사용자에게
  // 다른 상태다 — 만료면 EXPIRED_MESSAGE, 그 외(미결제 등)는 PAID_MESSAGE 로
  // 호출부(handler)가 갈라 응답한다.
  for (const row of rows) {
    console.warn(
      "program_access denied:",
      config.service_key,
      row.program_key,
      row.reason,
      row.expires_at ?? "unlimited",
    );
  }
  const expired = rows.some((row) => row.reason === "period_expired");
  return { allowed: false, reason: expired ? "period_expired" : null };
}

export async function checkEnrollmentPayment(
  supabaseAdmin: SupabaseClient,
  userId: string,
  config: ServiceConfig,
): Promise<boolean> {
  // sql/61_offline_enrollment_consolidation.sql — 예전엔 admin_enrollments 를
  // 조회했는데, 어드민이 실제로 수강생을 등록하는 테이블(src/pages/Admin.jsx
  // 'enrollments' config)과 달라 정상 등록한 오프라인 수강생이 앱에 절대
  // 못 들어가는 구조였다. 판정에 쓰는 7개 컬럼(id/profile_id/category_name/
  // program_name/class_name/payment_status/application_status)은 두 테이블에
  // 이름이 전부 동일해 컬럼명 치환 없이 테이블만 바꿨다(판정 로직은 그대로).
  const { data, error } = await supabaseAdmin
    .from("enrollments")
    .select(
      "id, profile_id, category_name, program_name, class_name, payment_status, application_status",
    )
    .eq("profile_id", userId)
    .limit(100);

  if (error) {
    throw error;
  }

  return (data || []).some((row) => {
    const nameText = [row.category_name, row.program_name, row.class_name]
      .map((value) => clean(value))
      .join(" ");

    const serviceMatched = config.payment_keywords.some((keyword) =>
      nameText.includes(keyword),
    );
    return serviceMatched && isPaidStatus(row.payment_status);
  });
}

// ---------------------------------------------------------------------------
// 로컬 QA 전용 이용권 게이트 우회 (DEV_BYPASS_ENTITLEMENT)
// ---------------------------------------------------------------------------
// 클라이언트의 VITE_FAKE_ENTITLEMENT(src/lib/entitlement.js)는 진입 가드만
// 통과시킬 뿐 서버는 전혀 모른다 — api/performance/* 8곳이 그대로
// hasPaidServiceAccess()로 403을 낸다. 이 함수는 그 서버 쪽 우회다.
//
// ⚠️ 안전장치 3중, 전부 필수:
//   ① process.env.VERCEL_ENV === 'production' → 무조건 거부.
//      Vercel이 배포 시 주입하는 값이라 앱 코드가 위조할 수 없다.
//   ② process.env.NODE_ENV === 'production' → 무조건 거부.
//   ③ 위 둘을 통과해도 DEV_BYPASS_ENTITLEMENT가 정확히 'true' 문자열일
//      때만 활성. VITE_ 접두어를 쓰지 않는다 — Vite가 그 접두어를 클라이언트
//      번들에 심는데, 이 값은 서버 전용이라 번들에 들어가면 의미가 뒤집힌다.
// 우회가 실제로 발동하면 매 호출마다 console.warn으로 남긴다 — 지금 우회
// 중이라는 사실이 로그에서 즉시 보여야 한다.
//
// ⚠️ **범위: 수행평가 전용이 아니다.** 이 플래그는 hasPaidServiceAccess()의 최상단에
//    걸려 있어 SERVICE_CONFIGS의 **모든 서비스**(suhaeng뿐 아니라 goal/target 등)와
//    이 함수를 쓰는 모든 라우트(create-service-ticket·check-service-access 포함)의
//    유료 판정을 함께 우회한다. 도입 맥락은 수행평가 로컬 QA였지만 효력은 전역이다 —
//    로컬에서 켜 두면 목표관리 SSO 티켓도 미결제 계정에서 발급된다.
//    범위를 좁혀야 하면 우회 발동을 config.service_key === 'suhaeng'으로 한정하면 된다.
export function isDevEntitlementBypassEnabled(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  if (process.env.NODE_ENV === "production") return false;
  return process.env.DEV_BYPASS_ENTITLEMENT === "true";
}

// 우회가 발동했을 때 진입 게이트(hasPaidServiceAccess → checkProgramAccessTable)를
// 통과시키기 위해 program_access 행을 만든다. 이 게이트는 지금도(checkout-renewal
// 이후) payment_status/access_status만 보고 meta는 보지 않으므로 이 부분은
// 그대로 유효하다.
//
// ⚠️ 이 행만으로는 더 이상 충분하지 않다 — `consume_performance_credit` RPC는
//    `program_access_grants` 원장을 보므로, 아래 ensureDevProgramAccessGrant()가
//    grant 행까지 만들어야 STEP3(recommend-topics)의 회차 소비가 통과한다.
//
// ⚠️ 이미 행이 있으면 손대지 않는다(실결제 데이터를 덮어쓰면 안 된다).
//    삽입 실패는 치명적이지 않다 — 실패해도 진입 우회(반환값 true) 자체는
//    유지하고 로그만 남긴다. 이 함수는 isDevEntitlementBypassEnabled()가
//    true인 경로에서만 호출된다 — 그 자체가 이미 3중 안전장치를 통과한
//    뒤이므로 여기서 다시 검사하지 않는다.
export async function ensureDevProgramAccessRow(
  supabaseAdmin: SupabaseClient,
  userId: string,
  config: ServiceConfig,
): Promise<void> {
  try {
    const programKey = config.program_keys[0];

    const { data: existing, error: selectError } = await supabaseAdmin
      .from("program_access")
      .select("id")
      .in("program_key", config.program_keys)
      .or(`id.eq.${userId},profile_id.eq.${userId},user_id.eq.${userId}`)
      .limit(1)
      .maybeSingle();

    if (selectError) {
      console.warn(
        `[serviceAccess] DEV_BYPASS_ENTITLEMENT: program_access 조회 실패(무시, 우회는 유지) — ${selectError.message}`,
      );
      return;
    }

    if (existing) return; // 기존 행(실결제 포함) 보존 — 덮어쓰지 않는다.

    const { error: insertError } = await supabaseAdmin
      .from("program_access")
      .insert({
        id: userId,
        program_key: programKey,
        payment_status: "paid",
        access_status: "active",
        memo: "[DEV_BYPASS_ENTITLEMENT] 로컬 QA 우회로 자동 생성된 행. 실제 회차·기간은 program_access_grants 원장을 본다(ensureDevProgramAccessGrant).",
      });

    if (insertError) {
      console.warn(
        `[serviceAccess] DEV_BYPASS_ENTITLEMENT: program_access 자동 생성 실패(무시, 우회는 유지) — ${insertError.message}`,
      );
      return;
    }

    console.warn(
      `[serviceAccess] DEV_BYPASS_ENTITLEMENT: program_access 행 자동 생성 (user=${userId}, program_key=${programKey})`,
    );
  } catch (error) {
    console.warn(
      "[serviceAccess] DEV_BYPASS_ENTITLEMENT: program_access 자동 생성 중 예외(무시, 우회는 유지)",
      error,
    );
  }
}

// 우회가 발동했을 때 `consume_performance_credit` RPC(부여 원장 기반, sql/64~66)까지
// 통과시키기 위해 `program_access_grants`에도 행을 만든다. **이 행은 장식이 아니라
// 필수 조건이다** — `performance_credit_ledger.grant_id`가 NOT NULL이라, 살아있는
// grant가 하나도 없으면 RPC가 원장 INSERT 자체를 시도하지 못해(quota_exhausted/
// no_entitlement로 먼저 반환) 차감이 항상 실패한다. 실제 RPC 본문(dev DB에서 직접
// 확인, 2026-08-12)을 읽고 정한 규칙이다:
//
//   · `granted_sessions is null` → 소비 루프가 즉시 채택하고 절대 소진되지
//     않는다("무제한 부여. 즉시 채택"). 회차 축의 무제한은 이 값으로만 표현된다.
//   · `expires_at is null` → 살아있는 부여 조회(`revoked_at is null and
//     (expires_at is null or expires_at > now())`)에서 영원히 걸러지지 않는다.
//     기간 축의 무기한은 이 값으로만 표현된다.
//
// ⚠️ 두 축을 동시에 null로 둘 수 없다 — 테이블 CHECK 제약이 막는다:
//     · pag_expiry_derivation_check: (granted_months is null) = (expires_at is null)
//     · pag_entitlement_shape_check: NOT (granted_months is null AND granted_sessions is null)
//   expires_at을 null로 두려면 granted_months도 null이어야 하는데(첫째 제약),
//   그러면 granted_sessions까지 null인 경우 둘째 제약을 어긴다. 즉
//   "회차 무제한 + 기간 무기한"을 동시에 만족하는 행은 DB 스키마상 존재할 수 없다.
//   실제로 깨졌던 지점(STEP3 recommend-topics의 quota_exhausted/no_entitlement)이
//   회차 축이므로 **회차 무제한(granted_sessions=null)을 우선**하고, 기간은
//   `granted_months`를 크게(100년) 잡아 사실상 무기한으로 근사한다.
//
// granted_by는 4개 허용값(payment/admin/promotion/qa) 중 'qa'를 쓴다 —
// 'admin'은 granted_by_actor NOT NULL을 추가로 요구하고(pag_admin_actor_check),
// 'payment'는 order_id/order_item_id NOT NULL을 요구한다
// (pag_payment_*_pairing_check). 'qa'는 그런 추가 요구가 없는 유일한 값이라
// 이 로컬 QA 우회 용도에 정확히 들어맞는다.
//
// ⚠️ program_key는 config.program_keys[0]을 그대로 쓰지 않는다.
//    program_access_grants.program_key는 `programs.program_key`를 FK로 참조하는데,
//    SERVICE_CONFIGS.goal.program_keys=['goal','target']처럼 레거시 호환용
//    별칭('goal')이 정본 테이블에는 없을 수 있다(운영 정본은 'target' —
//    products.service_key='goal'과는 다른 축이다). FK를 만족하는 후보를
//    programs 테이블에서 직접 찾아 쓴다.
//
// ⚠️ 이미 살아있는 grant가 있으면(revoked_at is null이고 만료 전) 만들지
//    않는다 — 중복 부여 금지. 삽입 실패는 치명적이지 않다: 로그만 남기고
//    우회(반환값 true) 자체는 유지한다.
export async function ensureDevProgramAccessGrant(
  supabaseAdmin: SupabaseClient,
  userId: string,
  config: ServiceConfig,
): Promise<void> {
  try {
    let programKey: string | null = null;

    for (const candidate of config.program_keys) {
      const { data: programRow, error: programError } = await supabaseAdmin
        .from("programs")
        .select("program_key")
        .eq("program_key", candidate)
        .maybeSingle();

      if (!programError && programRow) {
        programKey = candidate;
        break;
      }
    }

    if (!programKey) {
      console.warn(
        `[serviceAccess] DEV_BYPASS_ENTITLEMENT: programs 테이블에서 program_key 후보(${config.program_keys.join(
          ", ",
        )})를 하나도 찾지 못해 program_access_grants 행을 만들지 않습니다(우회 진입 자체는 유지되지만, ` +
          "살아있는 부여가 없으므로 이후 회차 소비 RPC 호출은 실패합니다 — no_entitlement 또는 quota_exhausted로 막힙니다).",
      );
      return;
    }

    const nowIso = new Date().toISOString();

    const { data: existing, error: selectError } = await supabaseAdmin
      .from("program_access_grants")
      .select("id")
      .eq("profile_id", userId)
      .eq("program_key", programKey)
      .is("revoked_at", null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .limit(1)
      .maybeSingle();

    if (selectError) {
      console.warn(
        `[serviceAccess] DEV_BYPASS_ENTITLEMENT: program_access_grants 조회 실패 — ${selectError.message} ` +
          "(우회 진입 자체는 유지되지만, 살아있는 부여를 확인하지 못해 새로 만들지 않습니다 — 기존 grant가 없다면 이후 회차 소비 RPC 호출이 실패합니다).",
      );
      return;
    }

    if (existing) return; // 이미 살아있는 부여가 있다 — 중복 부여 금지.

    const startsAt = new Date();
    const expiresAt = new Date(startsAt);
    expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 100); // 사실상 무기한(회차 무제한과 동시에 null로 둘 수 없다 — 위 주석 참고)

    const { error: insertError } = await supabaseAdmin
      .from("program_access_grants")
      .insert({
        profile_id: userId,
        program_key: programKey,
        granted_by: "qa",
        granted_months: 1200, // 100년 — expires_at과 nullness를 맞추기 위한 근사 무기한
        granted_sessions: null, // 회차 무제한 — consume_performance_credit이 즉시 채택하고 절대 소진되지 않는다
        paid_amount: 0,
        starts_at: startsAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        memo: "[DEV_BYPASS_ENTITLEMENT] 로컬 QA 우회로 자동 생성된 부여. granted_sessions=null(회차 무제한), granted_months=1200(~100년, DB 제약상 expires_at을 null로 둘 수 없어 근사).",
      });

    if (insertError) {
      console.warn(
        `[serviceAccess] DEV_BYPASS_ENTITLEMENT: program_access_grants 자동 생성 실패 — ${insertError.message} ` +
          "(우회 진입 자체는 유지되지만, 살아있는 부여가 없으므로 이후 회차 소비 RPC 호출은 실패합니다 — " +
          "performance_credit_ledger.grant_id가 NOT NULL이라 no_entitlement/quota_exhausted로 막힙니다).",
      );
      return;
    }

    console.warn(
      `[serviceAccess] DEV_BYPASS_ENTITLEMENT: program_access_grants 행 자동 생성 (user=${userId}, program_key=${programKey})`,
    );
  } catch (error) {
    console.warn(
      "[serviceAccess] DEV_BYPASS_ENTITLEMENT: program_access_grants 자동 생성 중 예외(무시, 우회는 유지)",
      error,
    );
  }
}

export async function hasPaidServiceAccess(
  supabaseAdmin: SupabaseClient,
  userId: string,
  config: ServiceConfig,
): Promise<{ allowed: boolean; reason: string | null }> {
  if (isDevEntitlementBypassEnabled()) {
    console.warn(
      `[serviceAccess] ⚠️ DEV_BYPASS_ENTITLEMENT 활성 — '${config.service_key}' 이용권 판정을 우회합니다 (user=${userId}). ` +
        "VERCEL_ENV/NODE_ENV가 production이면 이 경로는 절대 타지 않습니다.",
    );
    await ensureDevProgramAccessRow(supabaseAdmin, userId, config);
    await ensureDevProgramAccessGrant(supabaseAdmin, userId, config);
    return { allowed: true, reason: null };
  }

  const byProgramAccess = await checkProgramAccessTable(
    supabaseAdmin,
    userId,
    config,
  );
  if (byProgramAccess.allowed) return { allowed: true, reason: null };

  // ⚠ 이 경로는 기간 만료를 집행하지 않는다. enrollments(오프라인 수강)에는
  //    기간 컬럼이 0개라 만료 개념 자체가 없어서, 이 OR 분기로 들어온 사용자는
  //    영구 입장이 성립한다. dev 실측 0행이라 현재 미발현이지만 구조적 구멍이다.
  //    오프라인 수강의 기간 정책은 미결 항목이며 이번 범위 밖이다
  //    (sql/64 파일 말미 "남겨 둔 것" 참고).
  const byEnrollment = await checkEnrollmentPayment(
    supabaseAdmin,
    userId,
    config,
  );
  if (byEnrollment) return { allowed: true, reason: null };

  // program_access 쪽 판정이 만료였다면 enrollments 는 그 사유를 뒤집지 못한다
  // (enrollments 는 애초에 만료 개념이 없다) — program_access 의 reason 을 그대로 쓴다.
  return { allowed: false, reason: byProgramAccess.reason };
}

// ---------------------------------------------------------------------------
// 회차(quota) 스냅샷 — 안내용 읽기 전용
// ---------------------------------------------------------------------------
// 이 아래 두 함수는 **판정(allowed)에 관여하지 않는다.** 이용권 보유 여부는
// 위의 hasPaidServiceAccess()가 그대로 정본이고, 여기서 읽는 것은 화면에
// "남은 횟수 N회"를 표시하기 위한 부가 정보다.
//
// ⚠️ 실제 차감·차단 권위는 여기가 아니라 `public.consume_performance_credit`
//    RPC(부여 원장 `program_access_grants` 기반, checkout-renewal 브랜치가
//    sql/64~66에서 재작성)다. 그 RPC는 프로필 단위 advisory lock 을 잡은 뒤
//    살아있는 부여(`revoked_at is null and (expires_at is null or expires_at
//    > now())`)를 `for update`로 잠그고, 원장 INSERT 성공 시에만 소비를 기록한다.
//    이 함수는 잠그지 않고 `public.fn_program_access_grants_summary` RPC로
//    다시 계산된 값을 읽기만 하므로, 반환한 잔여 회차는 읽은 순간의 값일
//    뿐이며 다른 탭·기기가 동시에 차감하면 즉시 낡는다(TOCTOU).
//    클라이언트는 이 값을 안내에만 쓰고, 차단 여부는 차감 RPC를 감싼
//    api/performance/* 응답(409 QUOTA_EXHAUSTED)으로 판단해야 한다
//    (명세서 §2.2 「클라이언트 판정은 항상 안내용」, §9.3).
//
// ⚠️ `program_access.meta`의 `quota_total`/`quota_used` 키는 물리적으로
//    삭제됐다(checkout-renewal). 거기 남아 있던 값은 만료된 부여 회차까지
//    합산한 틀린 값이라 더 이상 읽지 않는다. `access_expires_at`/`expires_at`
//    컬럼도 표시·호환 전용 미러로 강등됐으므로(컬럼 코멘트 「정본 아님」)
//    회차·만료 판정에는 쓰지 않는다 — 대신 `fn_program_access_grants_summary`가
//    `program_access_grants` 원장에서 매번 다시 계산한 값을 쓴다.

/**
 * 이용권 행 1건을 찾는다. 컬럼 우선순위(id → profile_id → user_id)는
 * checkProgramAccessTable() 및 consume_performance_credit RPC와 동일하게
 * 맞춘다 — 서로 다른 행을 잡으면 표시값과 차감 대상이 어긋난다.
 *
 * 정렬 1순위는 **행의 유효성(statusRank)** 이다. 한 회원에게 stale한 행과
 * 살아 있는 행이 함께 있을 수 있기 때문이다 — 예: 환불된 옛 행
 * (`payment_status='refunded'`)이 남은 채 어드민 경로로 재결제한 사용자.
 * 유효성을 보지 않으면 그 사용자는 셸에서 엉뚱한 program_key/만료 미러를
 * 보게 된다.
 *
 * 이 함수가 반환하는 행 자체에는 더 이상 회차 정보(meta.quota_total 등)가
 * 없다 — 여기서 얻는 것은 표시용 program_key·plan_label(meta)·상태값뿐이고,
 * 실제 회차는 readQuotaSnapshot()이 이 행의 program_key로
 * fn_program_access_grants_summary RPC를 불러 별도로 얻는다.
 *
 * 여러 program_key(goal은 ['goal','target'])를 가진 서비스는 앞선 키에
 * 매칭된 행을 우선한다(SERVICE_CONFIGS의 배열 순서가 곧 우선순위다).
 *
 * @returns program_access 행 또는 null
 */
export type ProgramAccessRow = {
  id: string;
  program_key: string;
  profile_id: string | null;
  user_id: string | null;
  payment_status: string | null;
  access_status: string | null;
  meta: Record<string, unknown> | null;
  access_expires_at: string | null;
  expires_at: string | null;
  updated_at: string | null;
  created_at: string | null;
};

export async function findProgramAccessRow(
  supabaseAdmin: SupabaseClient,
  userId: string,
  config: ServiceConfig,
): Promise<ProgramAccessRow | null> {
  const { data, error } = await supabaseAdmin
    .from("program_access")
    .select(
      "id, program_key, profile_id, user_id, payment_status, access_status, meta, access_expires_at, expires_at, updated_at, created_at",
    )
    .in("program_key", config.program_keys)
    .or(`id.eq.${userId},profile_id.eq.${userId},user_id.eq.${userId}`)
    .limit(20);

  if (error || !data?.length) return null;

  // 유효한 행(0)을 만료·환불·정지된 행(1)보다 앞에 둔다. 진입 게이트
  // (checkProgramAccessTable)는 fn_program_access_state RPC로 판정하므로
  // 이 술어와 별개다 — 여기는 표시용 행을 고르는 로컬 판정일 뿐이다.
  const statusRank = (row) => {
    const endsAt = row.access_expires_at || row.expires_at || null;
    const expired = endsAt ? new Date(endsAt).getTime() <= Date.now() : false;
    return isPaidStatus(row.payment_status) &&
      isActiveStatus(row.access_status) &&
      !expired
      ? 0
      : 1;
  };
  const columnRank = (row) => {
    if (row.id === userId) return 0;
    if (row.profile_id === userId) return 1;
    return 2;
  };
  const keyRank = (row) => {
    const index = config.program_keys.indexOf(row.program_key);
    return index === -1 ? config.program_keys.length : index;
  };
  const freshness = (row) =>
    new Date(row.updated_at || row.created_at || 0).getTime();

  const sorted = [...data].sort(
    (a, b) =>
      statusRank(a) - statusRank(b) ||
      keyRank(a) - keyRank(b) ||
      columnRank(a) - columnRank(b) ||
      freshness(b) - freshness(a),
  );

  return sorted[0] || null;
}

/** meta 값이 정수 문자열/숫자일 때만 정수로 읽는다. 아니면 fallback. */
function readIntOrNull(
  value: unknown,
  fallback: number | null = null,
): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?[0-9]+$/.test(value.trim()))
    return parseInt(value, 10);
  return fallback;
}

/**
 * program_access 행 + `public.fn_program_access_grants_summary` RPC에서
 * 회차·플랜 정보를 뽑는다.
 *
 * 정본은 더 이상 `program_access.meta`가 아니라 `program_access_grants`
 * 원장이다(checkout-renewal). 그 원장을 매번 다시 집계해 주는 것이
 * `fn_program_access_grants_summary(p_profile_id, p_program_key)`이고,
 * 실제 확인한 반환 컬럼은 다음과 같다(2026-08-12, dev DB 직접 조회):
 *
 *   live_count        int   — revoked_at is null 이고 만료되지 않은(expires_at
 *                             is null or > now()) 부여 개수
 *   quota_total       int|null — 위 살아있는 부여들의 granted_sessions 합.
 *                             그중 하나라도 granted_sessions가 null(=회차
 *                             무제한)이면 전체가 null. **살아있는 부여가
 *                             하나도 없어도(live_count=0) SQL 집계 특성상
 *                             null로 나온다** — 이 null은 "무제한"이 아니라
 *                             "정보 없음/소진"이므로 live_count로 갈라야 한다.
 *   quota_used        int   — 살아있는 부여에 걸린 원장(performance_credit_
 *                             ledger) 소비량 합. never null(coalesce(...,0)).
 *   expires_at         ts|null — revoked_at is null인 **모든**(만료된 것 포함)
 *                             부여 중 하나라도 expires_at이 null(=기간 무기한)
 *                             이면 전체 null, 아니면 그 중 최댓값.
 *   unlimited_period   bool  — 위와 같은 집합에서 expires_at is null이 하나라도
 *                             있으면 true. **quota_total 계산과 모수(母數)가
 *                             다르다** — 이쪽은 만료된 부여도 포함한다.
 *   unlimited_sessions bool  — quota_total과 같은 모수(살아있는 부여만)에서
 *                             granted_sessions is null이 하나라도 있으면 true.
 *                             live_count=0이면 항상 false(coalesce 기본값).
 *
 * `quota_remaining`은 이 함수가 반환하지 않는다 — 여기서
 * `max(quota_total - quota_used, 0)`으로 직접 계산한다.
 *
 * 표시용 quotaTotal 산출 규칙(unlimited_sessions와 quota_total=null의
 * 모호성을 없애기 위해 live_count로 명시적으로 가른다):
 *   unlimited_sessions === true  →  null(무제한 표시)
 *   live_count === 0             →  0(살아있는 부여가 없다 = 소진/미보유 표시)
 *   그 외                        →  quota_total 그대로(양수)
 *
 * planEndsAt은 `access_expires_at`/`expires_at` 미러(표시·호환 전용, 정본
 * 아님) 대신 summary의 `expires_at`을 쓴다 — unlimited_period가 true인 경우
 * 이미 함수 안에서 null로 떨어지므로 별도 분기가 필요 없다.
 *
 * ⚠️ RPC 실패(함수 부재 포함 — checkout-renewal이 아직 push 전 브랜치라
 *    운영/다른 개발자 DB에는 없을 수 있다)는 **throw하지 않는다.** 이 값은
 *    판정 권위가 아니라 안내 표시용이라, 실패는 "정보 없음"(전부 null)으로
 *    흡수하고 경고 로그만 남긴다 — 여기서 던지면 표시용 정보 하나 때문에
 *    라우트 전체가 죽는다.
 *
 * planLabel은 여전히 program_access.meta.plan_label 계열에서 읽는다(원장에는
 * 상품명 개념이 없다) — 채워주는 파이프라인이 없으면 null이 정상값이다.
 *
 * @param supabaseAdmin - service-role Supabase 클라이언트
 * @param userId - RPC의 p_profile_id로 그대로 넘기는 값. 호출부가
 *   hasPaidServiceAccess/consume_performance_credit에 넘기는 것과 동일한
 *   auth user id다(program_access_grants.profile_id가 이 값을 직접 참조).
 * @param row - findProgramAccessRow()가 찾은 program_access 행.
 *   null이면 이용권 행 자체가 없다는 뜻이라 RPC를 부르지 않고 즉시
 *   "정보 없음"을 반환한다(기존 계약과 동일).
 */
export type QuotaSnapshot = {
  quotaTotal: number | null;
  quotaUsed: number | null;
  quotaRemaining: number | null;
  planEndsAt: string | null;
  planLabel: string | null;
};

export async function readQuotaSnapshot(
  supabaseAdmin: SupabaseClient,
  userId: string,
  row: ProgramAccessRow | null,
): Promise<QuotaSnapshot> {
  if (!row) {
    // 이용권 행이 없다(= admin_enrollments 경로로만 통과했거나 미보유).
    // 회차 개념이 붙을 자리가 없으므로 전부 null = "정보 없음"이다.
    // null을 0으로 내리면 무제한 사용자가 소진으로 보인다.
    return {
      quotaTotal: null,
      quotaUsed: null,
      quotaRemaining: null,
      planEndsAt: null,
      planLabel: null,
    };
  }

  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  const planLabelRaw =
    meta.plan_label ?? meta.planLabel ?? meta.plan_name ?? null;
  const planLabel = clean(planLabelRaw) || null;

  try {
    const { data, error } = await supabaseAdmin.rpc(
      "fn_program_access_grants_summary",
      {
        p_profile_id: userId,
        p_program_key: row.program_key,
      },
    );

    if (error) throw error;

    const summary = Array.isArray(data) ? data[0] : data;
    if (!summary) {
      return {
        quotaTotal: null,
        quotaUsed: null,
        quotaRemaining: null,
        planEndsAt: null,
        planLabel,
      };
    }

    const liveCount = readIntOrNull(summary.live_count, 0) ?? 0;
    const unlimitedSessions = summary.unlimited_sessions === true;

    let quotaTotal: number | null;
    if (unlimitedSessions) {
      quotaTotal = null;
    } else if (liveCount === 0) {
      quotaTotal = 0; // 살아있는 부여가 없다 — "정보 없음"이 아니라 "소진/미보유"다.
    } else {
      quotaTotal = readIntOrNull(summary.quota_total, 0);
      if (quotaTotal! < 0) quotaTotal = 0;
    }

    let quotaUsed = readIntOrNull(summary.quota_used, 0);
    if (quotaUsed === null || quotaUsed < 0) quotaUsed = 0;

    const quotaRemaining =
      quotaTotal === null ? null : Math.max(quotaTotal - quotaUsed, 0);

    return {
      quotaTotal,
      quotaUsed,
      quotaRemaining,
      planEndsAt: summary.expires_at || null,
      planLabel,
    };
  } catch (error) {
    console.warn(
      `[serviceAccess] fn_program_access_grants_summary 호출 실패 — 회차 표시를 "정보 없음"으로 흡수합니다` +
        `(판정에는 영향 없음. program_key=${row.program_key}, user=${userId})`,
      error?.message || error,
    );
    return {
      quotaTotal: null,
      quotaUsed: null,
      quotaRemaining: null,
      planEndsAt: null,
      planLabel,
    };
  }
}
