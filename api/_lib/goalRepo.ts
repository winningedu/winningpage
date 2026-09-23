// 목표관리(/app/goal) 서버 라우트가 공유하는 DB 접근 · 응답 조립 계층.
//
// 이 파일에는 계산 로직이 하나도 없다. 확률·rate·목표시간은 전부
// src/lib/goal/calc/ 의 동결된 순수 함수가 만들고(203개 테스트로 고정),
// 여기서는 그 결과를 DB 컬럼에 옮기고 다시 API 응답 모양으로 되돌리는
// 매핑만 한다.
//
// 스키마 정본: sql/55_goal_management.sql (dev DB 적용 완료 — 운영은 아직 미적용)
// 설계 근거:   docs/figma-goal/goal-schema-design.md §5(DDL) / §7(매핑표) / §9(API 계약)
//
// 세 가지 규약을 여기서 강제한다.
//   1) 소유자 판정은 언제나 세션 토큰에서 얻은 profileId 로만 한다.
//      service_role 클라이언트는 RLS 를 통째로 우회하므로(supabaseAdmin.js:7-8)
//      이 스코프가 유일한 방어선이다. 클라이언트가 보낸 어떤 id 도 쓰지 않는다.
//   2) 현재확률은 저장하지 않는다. 뷰 goal_student_state 가 매번
//      clamp(0,100, base + Σdelta) 로 재계산한다 — 캐시 컬럼을 두면 원본과
//      값이 갈린다(설계 문서 §4 "결정적 근거").
//   3) 응답 필드명은 카멜 케이스다. DB 스네이크를 그대로 노출하지 않는다(§9-2).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest } from "@vercel/node";
import { kstYMD } from "../../src/lib/goal/calc/virtualDate.js";
import { resolveUser } from "./httpAuth.js";
import {
  clean,
  hasPaidServiceAccess,
  SERVICE_CONFIGS,
} from "./serviceAccess.js";
import { createSupabaseAdmin } from "./supabaseAdmin.js";

// DB 행은 Database 생성 타입이 없어 열 이름만 알 수 있고 값 타입은 신뢰할 수 없다
// (numeric 이 문자열로 오는 드라이버 편차가 §"값 변환 헬퍼" 주석에 그대로 적혀 있다).
// api/goal/*.ts 소비처들은 이미 이 행을 `row.foo || 기본값` 식으로 넓게 duck-typing
// 해서 쓰고 있다(예: grades.ts naesinScores.records, daily-record.ts existing?.tasks) —
// 여기서 Record<string, unknown> 처럼 좁히면 그 소비처들이 전부 새 타입 에러를 낸다
// (임무 지시 규약 #2: 시그니처/응답 shape는 그대로 유지). 그래서 행 타입은 의도적으로
// any 로 남겨 마이그레이션 전 동작(런타임·타입 모두)을 그대로 보존한다.
// biome-ignore lint/suspicious/noExplicitAny: DB 행은 생성된 스키마 타입이 없고, 기존 소비처가 이미 무검사 프로퍼티 접근에 기대고 있다 — 좁히면 8개 소비 파일이 깨진다.
type Row = any;

// VercelRequest.headers 의 실제 타입(IncomingHttpHeaders)과 구조적으로 맞춘다 —
// 실제 VercelRequest 를 넘기는 8개 api/goal/*.ts 호출부가 타입 에러 없이 그대로 쓸 수
// 있게 openGoalSession 의 파라미터를 이만큼만 넓게 잡는다(openGoalSession 내부에서
// _lib/httpAuth.js 의 resolveUser(req: VercelRequest) 로 넘길 때만 캐스트한다 —
// resolveUser 시그니처는 api/_lib/httpAuth.ts 소유라 여기서 바꾸지 않는다).
type VercelLikeRequest = {
  headers: Record<string, string | string[] | undefined>;
};

// ---------------------------------------------------------------------------
// 테이블 · 공통 상수
// ---------------------------------------------------------------------------

export const TABLE_STUDENTS = "goal_students";
export const TABLE_STATE_VIEW = "goal_student_state";
export const TABLE_PROBABILITY_LOGS = "goal_probability_logs";
export const TABLE_UNIVERSITY_CUTS = "goal_university_cuts";
export const TABLE_PLAN_TASKS = "goal_plan_tasks";

// create-service-ticket.js:71-73 과 글자 단위로 같은 문구를 쓴다.
export const PAID_MESSAGE = "유료결제이후 이용해주세요!";
export const LOGIN_MESSAGE = "로그인이 필요합니다.";

// 컷 4종의 논리 이름. 422 응답의 missing 배열과 GET 응답의 missingCuts 에 그대로 실린다.
export const CUT_KEYS = [
  "idealNaesin",
  "idealJungsi",
  "minNaesin",
  "minJungsi",
];

// 학습 계획 과제(goal_plan_tasks) 과목 — DB CHECK 8종(supabase/migrations/
// 20260827011107_goal_timer_subjects.sql, 원래 5종에서 QA B9로 확장)과 AddTaskModal
// 과목 칩의 한글 라벨(TASK_SUBJECTS, src/components/goal/goalFormOptions.ts)을 잇는다.
// '탐구' → 'science' 매핑은 team-lead가 sql/75 CHECK 값을 먼저 확정해 준 결과다 —
// 사회탐구까지 포괄하는 라벨이지만 DB 값은 그대로 따른다. api/goal/plan-tasks.js 는 이
// 배럴만 참조하고 자체 매핑을 두지 않는다(단일 정본).
export const SUBJECT_CODE_TO_LABEL: Record<string, string> = {
  korean: "국어",
  math: "수학",
  english: "영어",
  science: "탐구",
  social: "사회",
  history: "한국사",
  second_lang: "제2외국어",
  etc: "기타",
};
export const SUBJECT_LABEL_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(SUBJECT_CODE_TO_LABEL).map(([code, label]) => [label, code]),
);

// ---------------------------------------------------------------------------
// 값 변환 헬퍼
// ---------------------------------------------------------------------------

/**
 * DB numeric 컬럼 → JS number. null/undefined 는 null 그대로 둔다.
 * PostgREST 는 numeric 을 JSON 숫자로 직렬화하지만, 드라이버·버전에 따라
 * 문자열로 넘어오는 경우를 대비해 한 겹 감싼다. 0 과 null 을 절대 섞지 않는다 —
 * base_* 의 null 은 "확률 미산출"이라는 의미이고 0 과 구분돼야 한다(§5 말미).
 */
export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** date/timestamptz 컬럼 → 'YYYY-MM-DD'. null 은 null. */
export function ymd(value: unknown): string | null {
  if (!value) return null;
  return String(value).slice(0, 10);
}

// ---------------------------------------------------------------------------
// 인증 · 이용권 게이트
// ---------------------------------------------------------------------------

export type GoalSessionError = {
  status: number;
  body: Record<string, unknown>;
};

export type GoalSessionResult = {
  error?: GoalSessionError;
  supabaseAdmin?: SupabaseClient;
  profileId?: string;
  allowed?: boolean;
};

/**
 * 세션 검증 + 이용권 판정을 한 번에 수행한다.
 *
 * 원본 외부 앱은 admin 액션 2개를 뺀 전 API 가 무인증이고 `code` 문자열만 알면
 * 타인 데이터를 읽고 썼다. 우리는 그 경로를 아예 만들지 않는다 —
 * profile_id 는 오직 auth.getUser(token).user.id 에서만 나온다
 * (check-service-access.js:45-52 와 동일한 절차, profiles 는 조회하지 않는다).
 *
 * 미결제 처리는 호출자가 정한다 — 쓰기형은 403, 조회형은 200 {allowed:false}
 * 이기 때문이다(§9-1). 여기서는 판정 결과만 돌려준다.
 */
export async function openGoalSession(
  req: VercelLikeRequest,
): Promise<GoalSessionResult> {
  // _lib/httpAuth.js의 resolveUser()로 수렴 — 토큰 없음/무효 두 경우 모두 null을
  // 돌려주는데, 원본도 두 경우 모두 같은 401 LOGIN_MESSAGE였으므로 동작 동일
  // (api/docs/refactor-plan.md 배치4). resolveUser는 내부에서 별도
  // createSupabaseAdmin()을 호출하지만 그 함수는 모듈 스코프 캐시 싱글턴이라
  // 아래에서 다시 부르는 것과 같은 인스턴스를 돌려준다(api/docs/batch-1-issues.md
  // 이슈 3과 동일 패턴).
  const authed = await resolveUser(req as unknown as VercelRequest);
  if (!authed) {
    return { error: { status: 401, body: { detail: LOGIN_MESSAGE } } };
  }

  const supabaseAdmin = createSupabaseAdmin();
  const profileId = authed.userId;
  // hasPaidServiceAccess는 { allowed, reason } 을 돌려준다(api/_lib/serviceAccess.js
  // 참고) — 이 함수의 반환 계약(allowed:boolean, 위 JSDoc)을 지키기 위해 여기서
  // 뽑아 쓴다. 객체를 그대로 내려보내면 호출부의 `if (!allowed)` 가 항상
  // false가 되어(객체는 always-truthy) 결제 게이트가 통째로 뚫린다.
  const { allowed } = await hasPaidServiceAccess(
    supabaseAdmin,
    profileId,
    // biome-ignore lint/style/noNonNullAssertion: goal 키는 SERVICE_CONFIGS에 정적으로 정의돼 있음
    SERVICE_CONFIGS.goal!,
  );

  return { supabaseAdmin, profileId, allowed };
}

/**
 * 호출부(api/goal/*.ts)가 `if (session.error) return ...` 를 통과시킨 뒤에만 쓴다.
 * GoalSessionResult의 supabaseAdmin/profileId는 타입상 optional이지만(error와
 * 상호 배타적인 필드라 TS가 자동으로 좁혀주지 않는다), openGoalSession 구현상
 * error가 없으면 항상 채워져 있다 — 그 사실을 이 한 지점에서만 단언해 호출부마다
 * `!`가 반복되지 않게 한다(신규 헬퍼, 기존 export 시그니처는 바꾸지 않았다).
 */
export function narrowGoalSession(session: GoalSessionResult): {
  supabaseAdmin: SupabaseClient;
  profileId: string;
} {
  return {
    // biome-ignore lint/style/noNonNullAssertion: 위 설명 참고 — session.error 체크 이후에만 호출됨
    supabaseAdmin: session.supabaseAdmin!,
    // biome-ignore lint/style/noNonNullAssertion: 위 설명 참고 — session.error 체크 이후에만 호출됨
    profileId: session.profileId!,
  };
}

/**
 * 두 프로필이 현재 approved 상태로 연결된 학부모-학생 쌍인지 SECURITY DEFINER RPC로
 * 확인한다(fn_is_linked_pair, supabase/migrations/20260821000000_baseline.sql). 학부모가
 * 자녀 목표관리 리포트를 열람하는 경로(api/goal/report.ts studentId 쿼리) 전용 — 순서는
 * 무관하다. 조회 실패는 fail-closed로 접는다(checkProgramAccessTable과 동일 판단,
 * api/_lib/serviceAccess.ts — 판정 불가를 "연결됨"으로 오인해 남의 리포트를 열어주지 않는다).
 */
export async function checkLinkedPair(
  supabaseAdmin: SupabaseClient,
  profileA: string,
  profileB: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("fn_is_linked_pair", {
    p_a: profileA,
    p_b: profileB,
  });
  if (error) {
    console.error("fn_is_linked_pair 호출 실패:", profileA, profileB, error);
    return false;
  }
  return data === true;
}

/**
 * 임의 프로필의 목표관리 이용권 판정. openGoalSession의 allowed는 항상 요청자 본인
 * 기준으로만 계산되므로(위 JSDoc 규약 1), 학부모가 자녀(studentId) 리포트를 열람할 때처럼
 * 요청자와 다른 프로필의 이용권을 다시 판정해야 하는 예외 경로 전용이다.
 */
export async function hasGoalAccessFor(
  supabaseAdmin: SupabaseClient,
  profileId: string,
): Promise<boolean> {
  const { allowed } = await hasPaidServiceAccess(
    supabaseAdmin,
    profileId,
    // biome-ignore lint/style/noNonNullAssertion: goal 키는 SERVICE_CONFIGS에 정적으로 정의돼 있음
    SERVICE_CONFIGS.goal!,
  );
  return allowed;
}

// ---------------------------------------------------------------------------
// 조회
// ---------------------------------------------------------------------------

/** 학생 마스터 1행. 없으면 null. */
export async function fetchStudentRow(
  supabaseAdmin: SupabaseClient,
  profileId: string,
): Promise<Row | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_STUDENTS)
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/**
 * profiles.name 1건 — 사이드바 인사말("OO의 목표관리") 등 학생 이름 표시 전용.
 * profile_id 는 곧 profiles.id(auth user id, openGoalSession 규약 1과 동일). 없거나
 * name 이 비어 있으면 null — 호출부가 "나의 목표관리" 등 이름 없는 문구로 폴백한다.
 */
export async function fetchProfileName(
  supabaseAdmin: SupabaseClient,
  profileId: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("name")
    .eq("id", profileId)
    .maybeSingle();

  if (error) throw error;
  return (data as Row | null)?.name || null;
}

/**
 * 현재확률 뷰 1행. 없으면 null.
 * 뷰는 security_invoker = true 이지만 service_role 은 RLS 를 우회하므로
 * 여기서도 profile_id 스코프가 유일한 소유자 판정이다.
 */
export async function fetchStudentStateRow(
  supabaseAdmin: SupabaseClient,
  profileId: string,
): Promise<Row | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_STATE_VIEW)
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export type ProbabilityHistoryEntry = {
  recordedAt: string;
  idealSusi: number | null;
  idealJungsi: number | null;
  minSusi: number | null;
  minJungsi: number | null;
};

/**
 * 확률 스냅샷 이력 — 오래된 순으로 전부 반환한다(대시보드 "학업 성취도 변화 추이" 차트 전용).
 * appendProbabilityLog()가 직전 행과 4값이 전부 같으면 건너뛰므로, 여기 담기는 행은
 * 이미 "변화가 있었던" 시점만 남는다 — 클라이언트에서 다시 중복 제거할 필요가 없다.
 */
export async function fetchProbabilityHistory(
  supabaseAdmin: SupabaseClient,
  profileId: string,
): Promise<ProbabilityHistoryEntry[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_PROBABILITY_LOGS)
    .select("ideal_susi, ideal_jungsi, min_susi, min_jungsi, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return ((data as Row[]) || []).map((row) => ({
    recordedAt: row.created_at as string,
    idealSusi: num(row.ideal_susi),
    idealJungsi: num(row.ideal_jungsi),
    minSusi: num(row.min_susi),
    minJungsi: num(row.min_jungsi),
  }));
}

/**
 * 대학·학과 컷 1건.
 *
 * department 는 널이 아니라 빈 문자열로 매칭한다 — 대학 단위 컷은
 * department_name = '' 로 저장되기 때문이다(§5 goal_university_cuts 주석,
 * 원본 student.mjs:993 `.eq('department', department || '')` 와 같은 규약).
 *
 * 행은 있는데 avg_cut 이 null 이면 "컷 없음"으로 취급한다 — 계산에 쓸 수 없는
 * 값이고, calcNaesinProb 은 이를 확률 0 으로 접어버려(primitives.js:119)
 * 미산출과 구분되지 않기 때문이다.
 *
 * ⚠ 조회는 표시명 3튜플로 한다. 유일성의 정본은 partial UNIQUE
 *   goal_university_cuts_name_key(cut_type, university_name, department_name)
 *   where is_active 다(sql/55_goal_management.sql (4) 인덱스 절) — 조회 술어와
 *   글자 단위로 같다. university_key / department_key 로 조회하지 않는 이유는
 *   온보딩 계약이 표시명만 보내기 때문이다(intake.js validateTarget).
 *
 *   그럼에도 `.order('id').limit(1)` 을 붙인다. 인덱스가 아직 적용되지 않은 DB
 *   (이 sql 은 수동 실행 대상이다 — 파일 헤더 5-7행)에서 표시명 중복 2행을
 *   만나면 `.maybeSingle()` 이 PGRST116 을 던지고, 그 예외가 intake.js 최상위
 *   catch 까지 올라가 온보딩 전체가 500 이 된다 — 422 cut_not_found 도 아니고
 *   awaiting_cuts 저장도 못 해 사용자 입력이 통째로 유실된다.
 *   limit(1) 이면 다중행에서도 결정적으로 1건(최소 id)을 골라 그 경로가 사라진다.
 */
export async function fetchUniversityCut(
  supabaseAdmin: SupabaseClient,
  cutType: string,
  universityName: string,
  departmentName: string,
): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_UNIVERSITY_CUTS)
    .select("avg_cut")
    .eq("cut_type", cutType)
    .eq("university_name", clean(universityName))
    .eq("department_name", clean(departmentName))
    .eq("is_active", true)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return num((data as Row | null)?.avg_cut);
}

export type TargetCutsInput = {
  schoolCutType: string;
  ideal: { university: string; department: string };
  min: { university: string; department: string };
};

export type TargetCuts = {
  idealNaesin: number | null;
  idealJungsi: number | null;
  minNaesin: number | null;
  minJungsi: number | null;
};

/**
 * 목표 대학 컷 4종을 한 번에 조회한다.
 *
 * 내신 컷의 cut_type 은 학교 유형에서 나온다(normal|special, getSchoolCutType).
 * 정시 컷은 언제나 'jungsi' 다. 같은 (대학, 학과)가 세 행으로 존재하고 세 행의
 * avg_cut 스케일이 서로 다르다는 점이 이 테이블의 핵심 함정이다(§5 (4) 주석).
 */
export async function fetchTargetCuts(
  supabaseAdmin: SupabaseClient,
  { schoolCutType, ideal, min }: TargetCutsInput,
): Promise<{ cuts: TargetCuts; missing: string[] }> {
  const [idealNaesin, idealJungsi, minNaesin, minJungsi] = await Promise.all([
    fetchUniversityCut(
      supabaseAdmin,
      schoolCutType,
      ideal.university,
      ideal.department,
    ),
    fetchUniversityCut(
      supabaseAdmin,
      "jungsi",
      ideal.university,
      ideal.department,
    ),
    fetchUniversityCut(
      supabaseAdmin,
      schoolCutType,
      min.university,
      min.department,
    ),
    fetchUniversityCut(supabaseAdmin, "jungsi", min.university, min.department),
  ]);

  const cuts: TargetCuts = { idealNaesin, idealJungsi, minNaesin, minJungsi };
  const missing = CUT_KEYS.filter(
    (key) => cuts[key as keyof TargetCuts] === null,
  );

  return { cuts, missing };
}

export const TABLE_DAILY_RECORDS = "goal_daily_records";

/**
 * 오늘(record_date 기준) 일별 기록 1행. 없으면 null.
 *
 * record_date 는 실제 달력 모델(가상 달력 모델 폐기, 실제 달력 전환 결정)의 정본 조회 키다 —
 * goal_daily_records_date_key(profile_id, record_date) UNIQUE 인덱스가 하루 1행을
 * 보장한다(sql/55_goal_management.sql (2) 인덱스 절).
 */
export async function fetchTodayRecord(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  recordDate: string,
): Promise<Row | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_DAILY_RECORDS)
    .select("*")
    .eq("profile_id", profileId)
    .eq("record_date", recordDate)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/**
 * QA3 행305 — 12시간 쿨다운 판정용 "가장 최근 제출" 1건. record_date(오늘)로
 * 필터하지 않는다 — 자정을 넘겨도 쿨다운이 이어져야 하기 때문이다(22시 제출 →
 * 익일 10시까지 잠금, 설계 문서 §5(c) B안). submitted_at 이 없는 행은 없다
 * (마이그레이션이 NOT NULL + 백필 보장).
 */
export async function fetchLatestDailyRecord(
  supabaseAdmin: SupabaseClient,
  profileId: string,
): Promise<Row | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_DAILY_RECORDS)
    .select("*")
    .eq("profile_id", profileId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

// ---------------------------------------------------------------------------
// 성장/학습방향 리포트(#33/#34/#37/#38) 조회 — api/goal/report.js 전용.
//
// 이 절의 함수 이름은 병렬 브랜치(daily-record/timer/plan)의 goalRepo.js 헬퍼와
// 겹치지 않도록 전부 `*InRange` 접미사로 새로 지었다(dev 머지 시 union되도록).
// 계산은 전혀 하지 않는다 — 행을 그대로 돌려주고, 합산·백분위 같은
// 산술은 src/lib/goal/report/aggregate.js(순수 함수)가 한다(이 파일의 §1 헌장 유지).
// ---------------------------------------------------------------------------

// 테이블 상수는 위(§별 절)에서 이미 선언된 것을 재사용한다 — 병렬 브랜치 union 머지 때
// 리포트 절이 들고 온 중복 선언(TABLE_DAILY_RECORDS/TIMER_SESSIONS/PLAN_TASKS)은 제거했다.
export const TABLE_MENTOR_COMMENTS = "goal_mentor_comments";

/** goal_daily_records — profile_id 1건, record_date 구간(양끝 포함) 전량. */
export async function fetchRecordsInRange(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  fromYmd: string,
  toYmd: string,
): Promise<Row[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_DAILY_RECORDS)
    .select("record_date, study_hours, body_condition, reasons, tasks")
    .eq("profile_id", profileId)
    .gte("record_date", fromYmd)
    .lte("record_date", toYmd)
    .order("record_date", { ascending: true });

  if (error) throw error;
  return (data as Row[]) || [];
}

/**
 * goal_timer_sessions — profile_id 1건, session_date 구간 전량. 마감된 세션만
 * 돌려준다(ended_at is not null) — 진행 중인 세션은 duration_seconds 가 null 이라
 * D7/D8 합산에 넣을 수 없다(reconcile 은 api/goal/timer.js 진입점에서만 도는데
 * 리포트 GET 은 그 진입점을 거치지 않으므로, 자정을 넘겨 여러 날 방치된 열린
 * 세션이 있어도 이 쿼리는 그 세션을 아예 보지 않는다 — 과소집계될 수 있다는
 * 뜻이지만, 열린 세션의 duration 을 리포트가 임의로 추정해 보여주는 것보다는
 * 안전하다고 판단했다, 판단 지점).
 */
export async function fetchTimerSessionsInRange(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  fromYmd: string,
  toYmd: string,
): Promise<Row[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_TIMER_SESSIONS)
    .select("subject, started_at, duration_seconds")
    .eq("profile_id", profileId)
    .gte("session_date", fromYmd)
    .lte("session_date", toYmd)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: true });

  if (error) throw error;
  return (data as Row[]) || [];
}

/**
 * goal_plan_tasks — profile_id 1건, plan_date 구간 전량(D3 완성도 계획 축 +
 * 행305 달성/미달성/미기록 집계). 단일 원본은 status — done은 하위 호환
 * 파생값이라 함께 선택은 하되 집계는 항상 status 기준으로 한다.
 */
export async function fetchPlanTasksInRange(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  fromYmd: string,
  toYmd: string,
): Promise<Row[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_PLAN_TASKS)
    .select("status, done")
    .eq("profile_id", profileId)
    .gte("plan_date", fromYmd)
    .lte("plan_date", toYmd);

  if (error) throw error;
  return (data as Row[]) || [];
}

/**
 * 확률 스냅샷 1건 — created_at 이 atOrBeforeIso 이하인 것 중 가장 최신.
 * 리포트 "합격 가능성 변화" 델타(D-합격가능성)의 시작/끝 스냅샷 조회에 공용으로 쓴다
 * (시작 스냅샷은 기간 시작 00:00 KST 이하, 끝 스냅샷은 기간 끝 23:59:59 KST 이하로
 *  호출부가 경계를 달리 넘긴다). 없으면 null.
 */
export async function fetchProbabilityLogAtOrBefore(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  atOrBeforeIso: string,
): Promise<Row | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_PROBABILITY_LOGS)
    .select("ideal_susi, ideal_jungsi, min_susi, min_jungsi, created_at")
    .eq("profile_id", profileId)
    .lte("created_at", atOrBeforeIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/**
 * 가장 이른 확률 스냅샷 1건 — 기간 시작 이전에 로그가 하나도 없을 때(리포트 기간이
 * 온보딩 주/달과 겹치는 경우) 시작 스냅샷 대체값으로 쓴다(판단 지점: "0에서 시작"이
 * 아니라 "온보딩 직후 첫 스냅샷에서 시작"으로 델타를 잡아야 온보딩 당일의 base 확률
 * 산출을 증가분으로 잘못 표시하지 않는다).
 */
export async function fetchEarliestProbabilityLog(
  supabaseAdmin: SupabaseClient,
  profileId: string,
): Promise<Row | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_PROBABILITY_LOGS)
    .select("ideal_susi, ideal_jungsi, min_susi, min_jungsi, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/**
 * 목표군 코호트(D4) — 동일 이상목표 대학·학과 + status='active' 학생의 profile_id 전량
 * (본인 포함, 호출부가 본인 id 를 그대로 넘긴다). sql/80_goal_report_indexes.sql
 * goal_students_ideal_target_idx 가 이 조합을 인덱싱한다.
 */
export async function fetchActiveCohortProfileIds(
  supabaseAdmin: SupabaseClient,
  idealUniversity: string,
  idealDepartment: string,
): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_STUDENTS)
    .select("profile_id")
    .eq("ideal_university", idealUniversity)
    .eq("ideal_department", idealDepartment)
    .eq("status", "active");

  if (error) throw error;
  return ((data as Row[]) || []).map((row) => row.profile_id as string);
}

/**
 * 코호트 전원의 기간 내 goal_daily_records 원본 행(profile_id, study_hours만).
 * profile_id 별 합산은 aggregate.js sumHoursByProfile() 이 한다(이 함수는 조회만).
 */
export async function fetchDailyRecordsForProfilesInRange(
  supabaseAdmin: SupabaseClient,
  profileIds: string[],
  fromYmd: string,
  toYmd: string,
): Promise<Row[]> {
  if (!profileIds.length) return [];

  const { data, error } = await supabaseAdmin
    .from(TABLE_DAILY_RECORDS)
    .select("profile_id, study_hours")
    .in("profile_id", profileIds)
    .gte("record_date", fromYmd)
    .lte("record_date", toYmd);

  if (error) throw error;
  return (data as Row[]) || [];
}

/** 멘토 코멘트 1건(기간당 1건). 없으면 null — 리포트는 이때 멘토 카드를 렌더하지 않는다. */
export async function fetchMentorComment(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  periodType: string,
  periodKey: string,
): Promise<Row | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_MENTOR_COMMENTS)
    .select("body, written_at")
    .eq("profile_id", profileId)
    .eq("period_type", periodType)
    .eq("period_key", periodKey)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

// ---------------------------------------------------------------------------
// 쓰기
// ---------------------------------------------------------------------------

/** 학생 마스터 upsert(사용자당 1행). 저장된 행을 그대로 돌려준다. */
export async function upsertStudentRow(
  supabaseAdmin: SupabaseClient,
  row: Row,
): Promise<Row> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_STUDENTS)
    .upsert(row, { onConflict: "profile_id" })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/**
 * 일별 기록 upsert. 정본 충돌키는 (profile_id, record_date) — 실제 달력 모델에서는
 * 하루 1건이 곧 record_index 도 1대1로 정하므로(record_index 는 diffDaysYMD 로
 * record_date 의 순함수) 두 UNIQUE 인덱스(index_key / date_key)가 동시에 지켜진다.
 * 저장된 행을 그대로 돌려준다(id 포함 — goal_probability_logs.source_record_id 용).
 */
export async function upsertDailyRecord(
  supabaseAdmin: SupabaseClient,
  row: Row,
): Promise<Row> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_DAILY_RECORDS)
    .upsert(row, { onConflict: "profile_id,record_date" })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export type ProbabilitySnapshot = {
  idealSusi: number | null;
  idealJungsi: number | null;
  minSusi: number | null;
  minJungsi: number | null;
};

export type ProbabilityLogReason = "intake" | "daily_record" | "score_update";

/**
 * 확률 스냅샷 append.
 *
 * 원본은 쓰기 액션마다 값 변동 여부와 무관하게 무조건 1행을 쌓아
 * (student.mjs:2601 / 2699 / 3079) 차트에 수평 중복점이 생겼다. 우리는
 * 직전 행과 4값이 전부 같으면 건너뛴다(§8 #15).
 *
 * @returns 실제로 행을 넣었으면 true
 */
export async function appendProbabilityLog(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  probs: ProbabilitySnapshot,
  reason: ProbabilityLogReason,
  sourceRecordId: string | number | null = null,
): Promise<boolean> {
  const { data: previous, error: readError } = await supabaseAdmin
    .from(TABLE_PROBABILITY_LOGS)
    .select("ideal_susi, ideal_jungsi, min_susi, min_jungsi")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readError) throw readError;

  const previousRow = previous as Row | null;

  if (
    previousRow &&
    num(previousRow.ideal_susi) === probs.idealSusi &&
    num(previousRow.ideal_jungsi) === probs.idealJungsi &&
    num(previousRow.min_susi) === probs.minSusi &&
    num(previousRow.min_jungsi) === probs.minJungsi
  ) {
    return false;
  }

  const { error: insertError } = await supabaseAdmin
    .from(TABLE_PROBABILITY_LOGS)
    .insert({
      profile_id: profileId,
      ideal_susi: probs.idealSusi,
      ideal_jungsi: probs.idealJungsi,
      min_susi: probs.minSusi,
      min_jungsi: probs.minJungsi,
      reason,
      source_record_id: sourceRecordId,
    });

  if (insertError) throw insertError;
  return true;
}

// ---------------------------------------------------------------------------
// 학습 계획 과제 (goal_plan_tasks) — CRUD
//
// 소유자 판정은 이 파일 상단 규약 그대로: 모든 조회·수정·삭제가 profileId를
// where 절에 함께 건다. service_role은 RLS를 우회하므로(§ openGoalSession
// 주석) 이 스코프가 유일한 방어선이다.
// ---------------------------------------------------------------------------

/**
 * 기간(from~to, 양끝 포함) 과제 목록. plan_date → sort_order → id 순.
 * workbook_id가 걸린 행은 연결된 문제집 제목도 함께 끌어온다(FK
 * goal_plan_tasks_workbook_id_fkey를 PostgREST가 인식해 임베드 조인) —
 * buildPlanTaskPayload가 workbookTitle을 채우는 데 쓴다.
 */
export async function fetchPlanTasks(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  fromDate: string,
  toDate: string,
): Promise<Row[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_PLAN_TASKS)
    .select("*, workbook:goal_workbooks(title)")
    .eq("profile_id", profileId)
    .gte("plan_date", fromDate)
    .lte("plan_date", toDate)
    .order("plan_date", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;
  return (data as Row[]) || [];
}

/**
 * 과제 1건 생성. select에 workbook 임베드 조인을 함께 걸어 반환 즉시
 * buildPlanTaskPayload가 workbookTitle까지 채울 수 있게 한다(fetchPlanTasks와
 * 동일 조인 — GET을 다시 안 불러도 방금 만든 과제 캡션이 보인다).
 */
export async function insertPlanTask(
  supabaseAdmin: SupabaseClient,
  row: Row,
): Promise<Row> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_PLAN_TASKS)
    .insert(row)
    .select("*, workbook:goal_workbooks(title)")
    .single();

  if (error) throw error;
  return data;
}

/**
 * 과제 1건 부분 수정(본인 소유 확인 겸용) — update 자체를
 * `.eq('id', id).eq('profile_id', profileId)` 로 좁혀 소유자 스코프와 존재 확인을
 * 한 왕복으로 처리한다. 반환이 null 이면 "없음" 과 "타인 소유" 를 구분하지 않는다
 * (다른 회원 존재 유무를 노출하지 않기 위해 호출부는 둘 다 404 로 접는다).
 */
export async function updatePlanTask(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  id: string | number,
  patch: Row,
): Promise<Row | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_PLAN_TASKS)
    .update(patch)
    .eq("id", id)
    .eq("profile_id", profileId)
    .select("*, workbook:goal_workbooks(title)")
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/** 과제 1건 삭제(본인 소유 확인 겸용). 실제로 지웠으면 true. */
export async function deletePlanTask(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  id: string | number,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_PLAN_TASKS)
    .delete()
    .eq("id", id)
    .eq("profile_id", profileId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export type PlanTaskStatus = "pending" | "done" | "fail";

/** status 컬럼 값을 3종으로 좁힌다 — 알 수 없는/누락 값은 pending으로 방어한다. */
export function normalizePlanTaskStatus(value: unknown): PlanTaskStatus {
  return value === "done" || value === "fail" ? value : "pending";
}

export type PlanTaskPayload = {
  id: unknown;
  planDate: string | null;
  title: unknown;
  subject: string;
  durationMinutes: number;
  status: PlanTaskStatus;
  done: boolean;
  sortOrder: number;
  // 문제집 연결(QA 행286-B), 셋 다 선택 — 연결이 없으면 workbookId는 null,
  // pageFrom/pageTo도 null, workbookTitle도 null.
  workbookId: unknown;
  pageFrom: number | null;
  pageTo: number | null;
  // fetchPlanTasks의 임베드 조인(workbook:goal_workbooks(title))에서만 채워진다 —
  // insertPlanTask/updatePlanTask 직후의 단건 반환 행에는 없을 수 있어 그때는 null.
  workbookTitle: string | null;
};

/**
 * goal_plan_tasks 행 → API 카멜 케이스. subject 는 한글 라벨로 되돌린다.
 * status가 단일 원본, done은 status에서 파생한 하위 호환 값(QA 행305).
 */
export function buildPlanTaskPayload(row: Row): PlanTaskPayload {
  const status = normalizePlanTaskStatus(row.status);
  return {
    id: row.id,
    planDate: ymd(row.plan_date),
    title: row.title,
    subject:
      SUBJECT_CODE_TO_LABEL[row.subject as string] || (row.subject as string),
    durationMinutes: num(row.duration_minutes) ?? 0,
    status,
    done: status === "done",
    sortOrder: num(row.sort_order) ?? 0,
    workbookId: row.workbook_id ?? null,
    pageFrom: num(row.page_from),
    pageTo: num(row.page_to),
    workbookTitle: row.workbook?.title ?? null,
  };
}

/**
 * status가 done으로 바뀌고 workbook_id·pageTo가 함께 있을 때 goal_workbooks.
 * current_page를 얼마나 전진시킬지 계산하는 순수 함수(QA 행286-B) —
 * max(기존 진도, 이번 과제 pageTo), 상한은 total_pages. done→pending으로
 * 되돌려도 이 함수는 호출되지 않는다(진도 롤백 없음, api/goal/plan-tasks.ts
 * handlePut 참고) — 페이지를 되감으면 다른 과제가 이미 더 앞서 있던 진도까지
 * 함께 밀릴 수 있어 명시적으로 하지 않기로 했다.
 */
export function nextWorkbookPageAfterTaskDone(
  existingCurrentPage: number,
  pageTo: number,
  totalPages: number,
): number {
  return Math.min(Math.max(existingCurrentPage, pageTo), totalPages);
}

// ---------------------------------------------------------------------------
// 응답 조립 (DB 스네이크 → API 카멜)
// ---------------------------------------------------------------------------

/** 저장된 컷 컬럼 기준으로 아직 비어 있는 컷의 논리 이름 목록. */
export function listMissingCuts(row: Row): string[] {
  const stored: TargetCuts = {
    idealNaesin: num(row.ideal_naesin_cut),
    idealJungsi: num(row.ideal_jungsi_cut),
    minNaesin: num(row.min_naesin_cut),
    minJungsi: num(row.min_jungsi_cut),
  };
  return CUT_KEYS.filter((key) => stored[key as keyof TargetCuts] === null);
}

export type TargetsPayload = {
  ideal: {
    university: string;
    department: string;
    naesinCut: number | null;
    jungsiCut: number | null;
  };
  min: {
    university: string;
    department: string;
    naesinCut: number | null;
    jungsiCut: number | null;
  };
};

/**
 * targets 블록. 온보딩 미완료(awaiting_cuts) 응답에도 그대로 실린다.
 *
 * naesinCut/jungsiCut은 sql/55_goal_management.sql:191-198 컬럼 코멘트대로 스케일이
 * 다르다 — naesinCut은 내신 등급 1~9(작을수록 우세), jungsiCut은 정시 백분위 0~100
 * (클수록 우세). "목표까지 남은 격차" 계산(src/lib/goal/gapToTarget.ts)이 이 부호
 * 반전을 그대로 물려받는다.
 */
export function buildTargets(row: Row): TargetsPayload {
  return {
    ideal: {
      university: (row.ideal_university as string) || "",
      department: (row.ideal_department as string) || "",
      naesinCut: num(row.ideal_naesin_cut),
      jungsiCut: num(row.ideal_jungsi_cut),
    },
    min: {
      university: (row.min_university as string) || "",
      department: (row.min_department as string) || "",
      naesinCut: num(row.min_naesin_cut),
      jungsiCut: num(row.min_jungsi_cut),
    },
  };
}

/**
 * GET /api/goal/student 의 200 본문(온보딩 완료 학생).
 * POST /api/goal/intake 의 `student` 필드도 완전히 같은 형태다(§9-3).
 *
 * @param row       goal_students 행
 * @param stateRow  goal_student_state 뷰 행
 * @param schoolCutType getSchoolCutType(row.school_type) 결과.
 *   DB 에 저장하지 않고 매번 파생한다(§7-2).
 * @param historyRows fetchProbabilityHistory() 결과(오래된 순). 생략 시 빈 배열.
 * @param profileName fetchProfileName() 결과. profiles.name 이 비어 있으면 null —
 *   호출부(GoalSidebar)가 "나의 목표관리" 등으로 폴백한다. 생략 시 null.
 * @param recentAvgStudyHours aggregate.js computeAvgStudyHours() 결과(최근 7일
 *   goal_daily_records 평균, 기록 0건이면 null) — 대시보드 웰컴 카드·목표까지 남은
 *   격차 카드의 "학습 시간 격차" 계산 전용. 이 함수 자체는 계산하지 않고 그대로 옮긴다
 *   (파일 헌장 §1 "계산 로직 없음" 유지). 생략 시 null.
 */
export function buildStudentPayload(
  row: Row,
  stateRow: Row | null,
  schoolCutType: string,
  historyRows: ProbabilityHistoryEntry[] = [],
  profileName: string | null = null,
  recentAvgStudyHours: number | null = null,
) {
  const state: Row = stateRow || {};

  return {
    onboarded: true,
    status: row.status,
    profile: {
      name: profileName,
      schoolType: row.school_type,
      grade: row.grade,
      schoolCutType,
    },
    targets: buildTargets(row),
    scores: {
      currentScore: num(row.current_score),
      convertedGrade: num(row.converted_grade),
      currentMogo: num(row.current_mogo),
      remainNaesin: num(row.remain_naesin),
      remainMogo: num(row.remain_mogo),
      lastNaesinExam: row.last_naesin_exam || "",
      lastMogoExam: row.last_mogo_exam || "",
    },
    baseProbs: {
      idealSusi: num(row.base_ideal_susi),
      idealJungsi: num(row.base_ideal_jungsi),
      minSusi: num(row.base_min_susi),
      minJungsi: num(row.base_min_jungsi),
    },
    // 파이프라인 반환 키(state.rates.idealSusiBonus)를 그대로 유지한다 —
    // 클라이언트가 state.rates 를 계산 모듈에 되먹일 수 있어야 한다(§7-2).
    rates: {
      idealSusiBonus: num(row.rate_ideal_susi),
      idealJungsiBonus: num(row.rate_ideal_jungsi),
      minSusiBonus: num(row.rate_min_susi),
      minJungsiBonus: num(row.rate_min_jungsi),
    },
    cumulativeBonus: {
      idealSusi: num(state.cum_ideal_susi) ?? 0,
      idealJungsi: num(state.cum_ideal_jungsi) ?? 0,
      minSusi: num(state.cum_min_susi) ?? 0,
      minJungsi: num(state.cum_min_jungsi) ?? 0,
    },
    // 저장된 값이 아니라 뷰가 base + Σdelta 로 매번 재계산한 값이다.
    probs: {
      idealSusi: num(state.ideal_susi),
      idealJungsi: num(state.ideal_jungsi),
      minSusi: num(state.min_susi),
      minJungsi: num(state.min_jungsi),
    },
    weeklySchedule: row.study_schedule || {},
    weekIdeal: num(row.week_ideal) ?? 0,
    weekMin: num(row.week_min) ?? 0,
    actualStartDate: ymd(row.actual_start_date),
    recordCount: num(state.record_count) ?? 0,
    lastRecordDate: ymd(state.last_record_date),
    // 최근 7일 순공시간 평균 — "학습 시간 격차" 계산 전용(src/lib/goal/gapToTarget.ts).
    recentAvgStudyHours,
    // "학업 성취도 변화 추이" 차트(4계열 라인) 전용. 오래된 순 그대로 넘긴다 — 정렬은
    // fetchProbabilityHistory()가 이미 했다(§9-4 확장).
    probabilityHistory: historyRows,
    // false 면 UI 는 정시 게이지를 "0%"가 아니라 "데이터 준비 중"으로 그린다.
    // calcJeongsiProb 은 currentMogo <= 0 일 때도 0 을 내므로(pipeline.js:227-228)
    // 이 플래그 없이는 두 상태를 구분할 수 없다(§9-4).
    jungsiAvailable:
      num(row.ideal_jungsi_cut) !== null && num(row.min_jungsi_cut) !== null,
    // 내 정보 수정(QA 2차 시트 행25・31・32) 편집 화면이 폼을 원래 입력값으로 미리
    // 채우는 데 쓴다. 위 targets/scores는 표시·계산 파생값이라(currentScore는 이미
    // 9등급 환산, lastNaesinExam은 FLOW 키가 아니라 라벨) 편집 폼 hydration에는
    // 쓸 수 없다 — 그래서 저장된 raw jsonb/컬럼을 그대로 얹는다. naesin_scores/
    // mock_exam_scores는 intake.ts가 쓰는 그 모양 그대로다(위 buildStudentPayload
    // 본문 주석 목록 밖의 새 필드라 기존 소비처는 영향받지 않는다).
    targetInput: {
      ideal: {
        university: row.ideal_university || "",
        department: row.ideal_department || "",
      },
      min: {
        university: row.min_university || "",
        department: row.min_department || "",
      },
    },
    naesinInput: row.naesin_scores || null,
    mockInput: row.mock_exam_scores || null,
  };
}

/**
 * status='awaiting_cuts' 학생의 200 본문. 확률 필드는 전부 생략한다(§9-4).
 * status 는 리터럴을 박지 않고 행에서 읽는다 — onboarded_at 이 비었는데 상태가
 * awaiting_cuts 가 아닌 행이 생기면 그 사실이 응답에 그대로 드러나야 한다.
 */
export function buildAwaitingCutsPayload(row: Row) {
  return {
    onboarded: false,
    status: row.status,
    targets: buildTargets(row),
    missingCuts: listMissingCuts(row),
  };
}

// ---------------------------------------------------------------------------
// 문제집(goal_workbooks) — "나의 노력" 화면(Efforts.jsx). api/goal/workbooks.js 전용.
// 스키마 정본: sql/76_goal_workbooks.sql.
// ---------------------------------------------------------------------------

export const TABLE_WORKBOOKS = "goal_workbooks";

/**
 * current_page/total_pages 비교로 완독 여부를 재계산한다. sql/76 (1) 주석과 같은 규약 —
 * status는 클라이언트가 직접 보낼 수 없고 이 함수의 결과만 저장한다.
 */
export function computeWorkbookStatus(
  currentPage: number,
  totalPages: number,
): "done" | "reading" {
  return currentPage >= totalPages ? "done" : "reading";
}

/**
 * "완독! 책장에 꽂기"(PUT {shelve:true})는 status='done'인 행에만 허용한다 — 페이지
 * 진도가 100%에 못 미치는데 책장에 먼저 꽂히는 상태를 막는다(supabase/migrations/
 * 20260902043539_goal_workbooks_shelved_at.sql 컬럼 코멘트와 동일 규약).
 */
export function canShelveWorkbook(status: unknown): boolean {
  return status === "done";
}

/** 본인 문제집 전체 목록. 등록 순서(오래된 순)를 그대로 보존한다. */
export async function fetchWorkbooks(
  supabaseAdmin: SupabaseClient,
  profileId: string,
): Promise<Row[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_WORKBOOKS)
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data as Row[]) || [];
}

/** 문제집 1건(본인 소유 한정). 없거나 타인 소유면 null — goalRepo 규약 #1(profileId 스코프가 유일한 소유자 판정). */
export async function fetchWorkbookOwned(
  supabaseAdmin: SupabaseClient,
  id: string | number,
  profileId: string,
): Promise<Row | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_WORKBOOKS)
    .select("*")
    .eq("id", id)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/** 문제집 insert. 저장된 행을 그대로 돌려준다. */
export async function insertWorkbook(
  supabaseAdmin: SupabaseClient,
  row: Row,
): Promise<Row> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_WORKBOOKS)
    .insert(row)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/** 문제집 update(본인 소유 한정). 없거나 타인 소유면 null — 두 조건 모두 eq에 실어 한 번에 판정한다. */
export async function updateWorkbookOwned(
  supabaseAdmin: SupabaseClient,
  id: string | number,
  profileId: string,
  patch: Row,
): Promise<Row | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_WORKBOOKS)
    .update(patch)
    .eq("id", id)
    .eq("profile_id", profileId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/** 문제집 delete(본인 소유 한정). 실제로 지운 행이 있었으면 true. */
export async function deleteWorkbookOwned(
  supabaseAdmin: SupabaseClient,
  id: string | number,
  profileId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_WORKBOOKS)
    .delete()
    .eq("id", id)
    .eq("profile_id", profileId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export type WorkbookPayload = {
  id: unknown;
  subject: unknown;
  title: unknown;
  totalPages: number | null;
  currentPage: number | null;
  status: unknown;
  // "책장에 꽂기" 수동 전이(Figma 4026:6046) — null이면 status='done'이어도 아직
  // BookStack으로 안 옮겨진 상태(공부 중인 책 목록에 "완독! 책장에 꽂기" 버튼과 함께 남는다).
  shelvedAt: string | null;
};

/** DB 스네이크 → API 카멜. subject는 id 그대로 실어 보낸다(한글 라벨 변환은 프론트 subjectTokens.js 담당). */
export function buildWorkbookPayload(row: Row): WorkbookPayload {
  return {
    id: row.id,
    subject: row.subject,
    title: row.title,
    totalPages: num(row.total_pages),
    currentPage: num(row.current_page),
    status: row.status,
    shelvedAt: row.shelved_at ?? null,
  };
}

export const TABLE_SCHEDULES = "goal_schedules";
// ---------------------------------------------------------------------------
// 중요일정 (sql/74_goal_schedules.sql) — 학생당 다건, 소유자 스코프는 profile_id.
// service_role 이 RLS 를 우회하므로 update/delete 는 반드시 .eq('profile_id', ...)를
// 같이 걸어 소유자 판정을 서버가 직접 강제한다(위 openGoalSession JSDoc 규약 1과 동일).
// ---------------------------------------------------------------------------

const SCHEDULE_SELECT_COLUMNS = "id, title, category, due_date, memo";

/** 본인 일정 전체, 마감일 오름차순. */
export async function fetchSchedules(
  supabaseAdmin: SupabaseClient,
  profileId: string,
): Promise<Row[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_SCHEDULES)
    .select(SCHEDULE_SELECT_COLUMNS)
    .eq("profile_id", profileId)
    .order("due_date", { ascending: true });

  if (error) throw error;
  return (data as Row[]) || [];
}

/** 일정 1건 insert. 저장된 행을 그대로 돌려준다. */
export async function insertSchedule(
  supabaseAdmin: SupabaseClient,
  row: Row,
): Promise<Row> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_SCHEDULES)
    .insert(row)
    .select(SCHEDULE_SELECT_COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

/**
 * 본인 소유 일정 1건 update.
 * @returns 갱신된 행. id가 없거나 본인 소유가 아니면 null(0행 매치).
 */
export async function updateSchedule(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  id: string | number,
  patch: Row,
): Promise<Row | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_SCHEDULES)
    .update(patch)
    .eq("id", id)
    .eq("profile_id", profileId)
    .select(SCHEDULE_SELECT_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/**
 * 본인 소유 일정 1건 delete.
 * @returns 실제로 삭제됐으면 true(0행 매치면 false).
 */
export async function deleteSchedule(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  id: string | number,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_SCHEDULES)
    .delete()
    .eq("id", id)
    .eq("profile_id", profileId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export type SchedulePayload = {
  id: unknown;
  title: unknown;
  category: unknown;
  dueDate: string | null;
  memo: unknown;
} | null;

/** DB 행(snake) → API 응답(camel). */
export function buildSchedulePayload(row: Row | null): SchedulePayload {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    dueDate: ymd(row.due_date),
    memo: row.memo || "",
  };
}

/**
 * naesin_scores / mock_exam_scores 두 컬럼만 부분 갱신한다(goal/grades.js 전용).
 *
 * upsertStudentRow(전체 행 upsert)를 쓰지 않는 이유: 이 경로는 온보딩 이후(행이 이미
 * 존재) 성적 기록만 추가하는 쓰기라 다른 컬럼(확률·컷·주간계획 등)을 아예 모르는 채로
 * 호출된다 — upsert에 부분 row를 넘기면 명시하지 않은 컬럼이 DB 기본값/NULL로 덮일
 * 위험이 있다(onConflict upsert는 누락 컬럼을 그대로 두지 않는다). update는 명시한
 * 키만 건드리므로 이 위험이 없다.
 */
export async function updateStudentGrades(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  {
    naesin_scores,
    mock_exam_scores,
  }: { naesin_scores?: unknown; mock_exam_scores?: unknown },
): Promise<Row> {
  const patch: Row = {};
  if (naesin_scores !== undefined) patch.naesin_scores = naesin_scores;
  if (mock_exam_scores !== undefined) patch.mock_exam_scores = mock_exam_scores;

  const { data, error } = await supabaseAdmin
    .from(TABLE_STUDENTS)
    .update(patch)
    .eq("profile_id", profileId)
    .select("naesin_scores, mock_exam_scores")
    .single();

  if (error) throw error;
  return data;
}

/**
 * 정시(jungsi) 확률·컷·rate 6개 컬럼만 부분 갱신한다(GET /api/goal/student 의
 * 지연 재계산 전용, 행296·332 QA3 §9-5 결정3). updateStudentGrades 와 같은
 * 이유로 upsert(전체 row) 대신 update 를 쓴다 — 이 경로는 온보딩 이후 딱
 * 이 6개 컬럼만 알고 호출되므로, 명시하지 않은 컬럼(확률 base_susi·주간계획
 * 등)을 건드리지 않는 update 가 안전하다.
 */
export async function updateStudentJungsiProb(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  patch: {
    ideal_jungsi_cut: number;
    min_jungsi_cut: number;
    base_ideal_jungsi: number;
    base_min_jungsi: number;
    rate_ideal_jungsi: number;
    rate_min_jungsi: number;
  },
): Promise<Row> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_STUDENTS)
    .update(patch)
    .eq("profile_id", profileId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// 학습방향 리포트(#37 내신 / #38 정시) 저장 · 이력 — QA 행301
// ---------------------------------------------------------------------------

export const TABLE_DIRECTION_REPORTS = "goal_direction_reports";

/**
 * 리포트 1건 저장 — (profile_id, kind, source_type, source_label) 동일 행이 있으면
 * 덮어쓴다(마이그레이션 unique index goal_direction_reports_identity_key, upsert
 * onConflict 문자열도 그 인덱스 컬럼 순서와 같아야 한다). api/_lib/goalDirectionReport.ts
 * buildGoalDirectionReport()의 반환값(payload/snapshot)을 그대로 옮겨 담는 얇은 어댑터.
 */
export async function saveGoalDirectionReport(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  {
    kind,
    sourceType,
    sourceLabel,
    payload,
    snapshot,
  }: {
    kind: "naesin" | "jungsi";
    sourceType: "intake" | "naesin" | "mogo";
    sourceLabel: string;
    payload: unknown;
    snapshot: unknown;
  },
): Promise<Row> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_DIRECTION_REPORTS)
    .upsert(
      {
        profile_id: profileId,
        kind,
        source_type: sourceType,
        source_label: sourceLabel,
        payload,
        snapshot,
      },
      { onConflict: "profile_id,kind,source_type,source_label" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/** kind별 저장 리포트 목록 — 최신순(회차 칩 표시 순서). */
export async function listGoalDirectionReports(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  kind: "naesin" | "jungsi",
): Promise<Row[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_DIRECTION_REPORTS)
    .select("id, source_type, source_label, payload, snapshot, created_at")
    .eq("profile_id", profileId)
    .eq("kind", kind)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as Row[]) || [];
}

export const TABLE_TIMER_SESSIONS = "goal_timer_sessions";
export const TABLE_SUBJECT_TARGETS = "goal_subject_targets";

// 과목 코드 8종(QA B9로 5종에서 확장). goal_plan_tasks·goal_timer_sessions·
// goal_subject_targets·goal_timer_subjects가 공유하는 CHECK 도메인과 글자 단위로 같다
// (supabase/migrations/20260827011107_goal_timer_subjects.sql). 열공 타이머 "+ 과목
// 추가" 모달의 선택 카탈로그 = 이 배열 그대로(순서도 동일, src/components/goal/
// studyRecordOptions.ts TIMER_SUBJECT_CATALOG와 글자 단위로 같다).
export const TIMER_SUBJECTS = [
  "korean",
  "math",
  "english",
  "science",
  "social",
  "history",
  "second_lang",
  "etc",
];

// 열공 타이머 기본 노출 4과목(QA B9 이전부터의 고정 그리드) — goal_timer_subjects에
// 행이 없는 학생에게 기본값으로 보여준다. src/components/goal/studyRecordOptions.ts
// DEFAULT_TIMER_SUBJECTS와 글자 단위로 같다(클라이언트는 이 서버 파일을 import할 수
// 없어 — service_role 키를 물고 있는 supabaseAdmin.js를 재수출하게 된다 — 별도로 둔다).
export const DEFAULT_TIMER_SUBJECTS = ["math", "korean", "english", "science"];

export const TABLE_TIMER_SUBJECTS = "goal_timer_subjects";

// ---------------------------------------------------------------------------
// 열공 타이머(#25) — 서버 시각 기반 세션 영속화 + 과목별 목표
//
// 원칙: started_at/ended_at/duration_seconds 는 전부 서버 now() 로만 계산한다.
// 클라이언트가 보낸 시각·초 값은 어디서도 신뢰·저장하지 않는다(sql/77 헤더 배경).
// ---------------------------------------------------------------------------

// 하트비트가 이 시간(ms)보다 오래 끊기면 열린 세션을 서버가 강제 마감한다.
const TIMER_STALE_MS = 5 * 60 * 1000;

/** ended_at - started_at 을 초로, [0, 43200](12시간) 캡 적용해 계산한다. */
function computeTimerDurationSeconds(
  startedAt: string,
  endedAtDate: Date,
): number {
  const seconds = Math.round(
    (endedAtDate.getTime() - new Date(startedAt).getTime()) / 1000,
  );
  return Math.max(0, Math.min(43200, seconds));
}

/** 주어진 KST 날짜(session_date, 'YYYY-MM-DD')의 다음날 00:00(+09:00)을 Date로. */
function nextKstMidnight(sessionDateYmd: string): Date {
  const base = new Date(`${sessionDateYmd}T00:00:00+09:00`);
  return new Date(base.getTime() + 24 * 60 * 60 * 1000);
}

/** 학생의 열린(ended_at is null) 세션 1건. 없으면 null. */
async function fetchOpenTimerSession(
  supabaseAdmin: SupabaseClient,
  profileId: string,
): Promise<Row | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_TIMER_SESSIONS)
    .select("*")
    .eq("profile_id", profileId)
    .is("ended_at", null)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/** 세션 1건을 지정 시각·사유로 마감한다. duration_seconds 는 서버가 계산한다. */
async function closeTimerSessionRow(
  supabaseAdmin: SupabaseClient,
  row: Row,
  endedAtDate: Date,
  endReason: string,
): Promise<Row> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_TIMER_SESSIONS)
    .update({
      ended_at: endedAtDate.toISOString(),
      duration_seconds: computeTimerDurationSeconds(
        row.started_at as string,
        endedAtDate,
      ),
      end_reason: endReason,
    })
    .eq("id", row.id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/** 새 세션을 연다. session_date 는 startedAtDate 의 KST 날짜로 서버가 채운다. */
async function insertTimerSession(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  subject: string,
  startedAtDate: Date,
): Promise<Row> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_TIMER_SESSIONS)
    .insert({
      profile_id: profileId,
      subject,
      session_date: kstYMD(startedAtDate),
      started_at: startedAtDate.toISOString(),
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/**
 * 모든 타이머 진입점(start/stop/heartbeat/GET/setTarget)이 공통으로 먼저 거치는
 * 멱등 정리 2단계.
 *
 *  (a) 자정 분할 — 열린 세션의 session_date 가 오늘(KST)보다 과거면, 날짜
 *      경계마다 그 세션을 다음날 00:00(+09:00)에 'midnight' 마감하고 같은
 *      과목으로 그 시각에 새 세션을 이어 붙인다. 여러 날에 걸쳐 있으면
 *      today 에 닿을 때까지 반복한다.
 *  (b) 스테일 스윕 — (a) 이후 남은 열린 세션의 `now - coalesce(last_heartbeat_at,
 *      started_at)` 이 5분을 넘으면, 그 하트비트/시작 시각으로(=지금이 아니라)
 *      'timeout' 마감한다.
 *
 * @returns 정리 후 남은 열린 세션(없으면 null).
 */
export async function reconcileTimerState(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  now: Date = new Date(),
): Promise<Row | null> {
  let open = await fetchOpenTimerSession(supabaseAdmin, profileId);
  const today = kstYMD(now);

  // 자정을 여러 날 건너뛴 방치 세션도 유한 시간에 끝나도록 상한을 둔다
  // (시계 오류 등으로 session_date 가 미래로 새는 이상 상태에서도 무한루프 방지).
  let guard = 0;
  while (open && (open.session_date as string) < today && guard < 400) {
    const midnight = nextKstMidnight(open.session_date as string);
    await closeTimerSessionRow(supabaseAdmin, open, midnight, "midnight");
    open = await insertTimerSession(
      supabaseAdmin,
      profileId,
      open.subject as string,
      midnight,
    );
    guard += 1;
  }

  if (open) {
    const reference = new Date(
      (open.last_heartbeat_at as string) || (open.started_at as string),
    );
    if (now.getTime() - reference.getTime() > TIMER_STALE_MS) {
      await closeTimerSessionRow(supabaseAdmin, open, reference, "timeout");
      open = null;
    }
  }

  return open;
}

/**
 * 과목 측정을 시작한다. 열린 세션이 있으면 'switch'로 먼저 마감한다.
 * partial unique index(profile_id) where ended_at is null 위반(23505)은
 * 동시 탭 등으로 그 사이 다른 세션이 열렸다는 뜻이라, 다시 열린 세션을
 * 찾아 마감 후 1회만 재시도한다.
 */
export async function startTimerSession(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  subject: string,
  now: Date = new Date(),
): Promise<Row> {
  const open = await reconcileTimerState(supabaseAdmin, profileId, now);
  if (open) {
    await closeTimerSessionRow(supabaseAdmin, open, now, "switch");
  }

  try {
    return await insertTimerSession(supabaseAdmin, profileId, subject, now);
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      const stillOpen = await fetchOpenTimerSession(supabaseAdmin, profileId);
      if (stillOpen) {
        await closeTimerSessionRow(supabaseAdmin, stillOpen, now, "switch");
      }
      return await insertTimerSession(supabaseAdmin, profileId, subject, now);
    }
    throw error;
  }
}

/** 열린 세션을 'stop'으로 마감한다. 열린 세션이 없으면 null(멱등, 에러 아님). */
export async function stopTimerSession(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  now: Date = new Date(),
): Promise<Row | null> {
  const open = await reconcileTimerState(supabaseAdmin, profileId, now);
  if (!open) return null;
  return closeTimerSessionRow(supabaseAdmin, open, now, "stop");
}

/** 열린 세션의 last_heartbeat_at 을 touch 한다. 열린 세션이 없으면 null(무해). */
export async function touchTimerHeartbeat(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  now: Date = new Date(),
): Promise<Row | null> {
  const open = await reconcileTimerState(supabaseAdmin, profileId, now);
  if (!open) return null;

  const { data, error } = await supabaseAdmin
    .from(TABLE_TIMER_SESSIONS)
    .update({ last_heartbeat_at: now.toISOString() })
    .eq("id", open.id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export type TimerDaySummary = {
  date: string;
  running: { subject: unknown; startedAt: unknown } | null;
  subjects: { subject: string; seconds: number }[];
  totalSeconds: number;
};

/**
 * GET 응답용 오늘(KST) 요약. reconcile 을 먼저 거친 뒤, 오늘 날짜로 마감된
 * 세션만 과목별로 합산한다 — 진행 중 세션의 경과분은 서버가 더하지 않는다
 * (프론트가 serverNow - startedAt 으로 표시용 라이브 값을 얹는다, 임무 지시
 * 프론트 절 참고).
 */
export async function fetchTimerDaySummary(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  now: Date = new Date(),
): Promise<TimerDaySummary> {
  const open = await reconcileTimerState(supabaseAdmin, profileId, now);
  const today = kstYMD(now);

  const { data, error } = await supabaseAdmin
    .from(TABLE_TIMER_SESSIONS)
    .select("subject, duration_seconds")
    .eq("profile_id", profileId)
    .eq("session_date", today)
    .not("ended_at", "is", null);

  if (error) throw error;

  const bySubject: Record<string, number> = {};
  for (const row of (data as Row[]) || []) {
    const subject = row.subject as string;
    bySubject[subject] =
      (bySubject[subject] || 0) + (num(row.duration_seconds) ?? 0);
  }

  const subjects = TIMER_SUBJECTS.map((subject) => ({
    subject,
    seconds: bySubject[subject] || 0,
  }));
  const totalSeconds = subjects.reduce((sum, item) => sum + item.seconds, 0);

  return {
    date: today,
    running: open
      ? { subject: open.subject, startedAt: open.started_at }
      : null,
    subjects,
    totalSeconds,
  };
}

/** 과목별 목표 시간(설정된 과목만). 미설정 과목은 행 자체가 없다 — 기본값은 프론트 파생. */
export async function fetchSubjectTargets(
  supabaseAdmin: SupabaseClient,
  profileId: string,
): Promise<{ subject: unknown; targetHours: number | null }[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_SUBJECT_TARGETS)
    .select("subject, target_hours")
    .eq("profile_id", profileId);

  if (error) throw error;
  return ((data as Row[]) || []).map((row) => ({
    subject: row.subject,
    targetHours: num(row.target_hours),
  }));
}

/** 과목별 목표 시간 upsert(학생이 타이머 페이지에서 자율 설정). */
export async function upsertSubjectTarget(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  subject: string,
  targetHours: number,
): Promise<{ subject: unknown; targetHours: number | null }> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_SUBJECT_TARGETS)
    .upsert(
      { profile_id: profileId, subject, target_hours: targetHours },
      { onConflict: "profile_id,subject" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return { subject: data.subject, targetHours: num(data.target_hours) };
}

/**
 * 학생이 타이머 화면에 노출 중인 과목 목록(sort_order → created_at 순). 행이 없으면
 * DEFAULT_TIMER_SUBJECTS 사본을 돌려준다 — 기존 학생 백필 없이 "기본 4과목"을
 * 표현하는 방식(QA B9, supabase/migrations/20260827011107_goal_timer_subjects.sql).
 */
export async function fetchVisibleTimerSubjects(
  supabaseAdmin: SupabaseClient,
  profileId: string,
): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_TIMER_SUBJECTS)
    .select("subject, sort_order")
    .eq("profile_id", profileId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  const rows = (data as Row[]) || [];
  if (rows.length === 0) return [...DEFAULT_TIMER_SUBJECTS];
  return rows.map((row) => row.subject as string);
}

/**
 * 타이머 노출 과목 추가("+ 과목 추가", QA B9). 아직 이 학생의 행이 하나도 없으면
 * 기본 4과목을 sort_order 0..3으로 먼저 물질화한 뒤, 요청 과목을 다음 sort_order로
 * 이어 추가한다. 이미 노출 중인 과목을 다시 추가해도 멱등(upsert ignoreDuplicates)
 * — 카탈로그 유효성(TIMER_SUBJECTS.includes) 검증은 호출부(api/goal/timer.ts)가
 * 먼저 한다. 반환은 갱신된 노출 목록 전체.
 */
export async function addTimerSubject(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  subject: string,
): Promise<string[]> {
  const { data: existingData, error: fetchError } = await supabaseAdmin
    .from(TABLE_TIMER_SUBJECTS)
    .select("subject, sort_order")
    .eq("profile_id", profileId);

  if (fetchError) throw fetchError;
  let rows = (existingData as Row[]) || [];

  if (rows.length === 0) {
    const defaults = DEFAULT_TIMER_SUBJECTS.map((code, index) => ({
      profile_id: profileId,
      subject: code,
      sort_order: index,
    }));
    const { error: seedError } = await supabaseAdmin
      .from(TABLE_TIMER_SUBJECTS)
      .upsert(defaults, {
        onConflict: "profile_id,subject",
        ignoreDuplicates: true,
      });
    if (seedError) throw seedError;
    rows = defaults as unknown as Row[];
  }

  const nextSortOrder =
    rows.reduce((max, row) => Math.max(max, num(row.sort_order) ?? -1), -1) + 1;

  const { error: insertError } = await supabaseAdmin
    .from(TABLE_TIMER_SUBJECTS)
    .upsert(
      { profile_id: profileId, subject, sort_order: nextSortOrder },
      { onConflict: "profile_id,subject", ignoreDuplicates: true },
    );
  if (insertError) throw insertError;

  return fetchVisibleTimerSubjects(supabaseAdmin, profileId);
}

// ---------------------------------------------------------------------------
// AI 조언 캐시(goal_advice_cache, QA 행295·306) — api/goal/advice.ts 전용.
// ---------------------------------------------------------------------------

export const TABLE_ADVICE_CACHE = "goal_advice_cache";

export type AdviceCacheSource = "intake" | "daily";
export type AdviceCacheOrigin = "ai" | "rule";

/** (profile_id, source, generated_for) 1행. 없으면 null(오늘 아직 생성 안 함 = 캐시 미스). */
export async function fetchAdviceCache(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  source: AdviceCacheSource,
  generatedFor: string,
): Promise<Row | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_ADVICE_CACHE)
    .select("*")
    .eq("profile_id", profileId)
    .eq("source", source)
    .eq("generated_for", generatedFor)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/**
 * upsert — (profile_id, source, generated_for) UNIQUE라 재시도·재제출은 같은 하루 값을
 * 덮어쓴다(goal_daily_records upsert와 동일 정책). 레이트리밋은 이 캐시 자체다 — 호출부가
 * fetchAdviceCache로 먼저 확인해 캐시 히트면 Gemini를 아예 부르지 않는다.
 */
export async function upsertAdviceCache(
  supabaseAdmin: SupabaseClient,
  payload: {
    profile_id: string;
    source: AdviceCacheSource;
    generated_for: string;
    origin: AdviceCacheOrigin;
    payload: Record<string, unknown>;
  },
): Promise<Row> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_ADVICE_CACHE)
    .upsert(payload, { onConflict: "profile_id,source,generated_for" })
    .select()
    .single();

  if (error) throw error;
  return data;
}
