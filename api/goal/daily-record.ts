// GET/POST /api/goal/daily-record
// Authorization: Bearer <access_token>
//
// 목표관리 "오늘의 공부 기록"(#26 페이지) · "오늘의 목표" 대시보드 카드가 공유하는
// 일별 기록 엔드포인트. 컨벤션은 api/goal/intake.js · api/goal/student.js 하우스
// 스타일을 그대로 따른다(openGoalSession, config.runtime, 405/401/403/500 형태).
//
// ── 실제 달력 모델(팀장 작업 지시 "배경" 절, 확정 설계 — 변경 금지) ──────────
// goal_daily_records.record_index 는 "제출 순번"이 아니라
// actual_start_date 부터 **실제 KST 경과 일수**다(diffDaysYMD). record_date 는
// 실제 오늘(KST) 그 자체다. (profile_id, record_date) UNIQUE 가 하루 1행을
// 보장하고, 당일 재제출은 upsert(= 갱신 + delta 재계산)로 처리한다 — 과거 날짜
// 쓰기는 불가능하다(recordIndex 가 음수면 400).
//
// ── 수식 v2 ─────────────────────────────────────────────────────────────
// delta = rate × 달성률배수 × 컨디션배수 × 과목태그배수. 계산은 전부
// src/lib/goal/calc/bonusV2.js(calculateDailyBonusV2)에 위임한다 — 이 파일은
// DB 컬럼 ↔ 계산 함수 인자를 잇는 배선만 한다(bonus.js/pipeline.js 는 동결,
// 이 파일이 재구현하지 않는다).
//
// ── 부분 제출(카드 vs 페이지) ────────────────────────────────────────────
// 대시보드 "오늘의 목표" 카드는 studyHours만 보낸다. "오늘의 공부 기록" 페이지는
// bodyCondition/reasons/tasks/memo(+선택적으로 studyHours)를 보낸다. 이 라우트는
// 바디에 있는 필드만 교체하고 나머지는 오늘 기존 행의 값을 유지한다(merge) —
// 그래서 카드 제출이 페이지에서 이미 기록한 컨디션·태그를 지우지 않고, 페이지
// 제출도 카드가 이미 기록한 순공 시간을 지우지 않는다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  addDaysYMD,
  calculateDailyBonusV2,
  diffDaysYMD,
  getDayIndexFromYMDServer,
  kstYMD,
  VIRTUAL_DAY_NAMES,
} from "../../src/lib/goal/calc/index.js";
import {
  appendProbabilityLog,
  fetchLatestDailyRecord,
  fetchStudentRow,
  fetchStudentStateRow,
  fetchTimerDaySummary,
  fetchTodayRecord,
  narrowGoalSession,
  num,
  openGoalSession,
  PAID_MESSAGE,
  upsertDailyRecord,
} from "../_lib/goal/repo.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

// api/_lib/goal/repo.ts(.js, Stage3 대상)의 openGoalSession 반환 shape을 그 함수 자체에서
// 추론해 재사용한다(중복 선언 없이 JSDoc이 바뀌면 여기도 함께 따라간다).
type GoalSession = Awaited<ReturnType<typeof openGoalSession>>;

// ---------------------------------------------------------------------------
// 화이트리스트 — 코드값 → 한글 라벨 (src/components/goal/studyRecordOptions.js 와 글자 단위로 같다)
// ---------------------------------------------------------------------------

// STUDY_ITEM_OPTIONS(studyRecordOptions.js:49-56). schoolSubject→'내신 과목' /
// mockExam→'기출/모의고사' 는 bonusV2.js 의 TASK_NAESIN/TASK_MOCK_EXAM 태그 가산
// 입력이기도 하다 — 라벨이 어긋나면 태그 가산이 조용히 0배가 된다.
export const TASK_LABELS = {
  concept: "개념 학습",
  academyHomework: "학원 숙제",
  wrongAnswerReview: "오답 정리",
  schoolSubject: "내신 과목",
  mockExam: "기출/모의고사",
  etc: "기타",
};

// DISTURBANCE_OPTIONS(studyRecordOptions.js:40-46). 수식 미반영 — 기록 전용(팀장 지시).
export const REASON_LABELS = {
  academySchedule: "수업 · 학원 일정",
  smartphone: "스마트폰",
  fatigue: "피로 · 수면 부족",
  distraction: "집중 안 됨",
  none: "없었음",
};

// CONDITION_OPTIONS(studyRecordOptions.js:31-36). sql/73_goal_daily_record_v2.sql 의
// body_condition CHECK 값 도메인과 정확히 같다(빈 문자열 별도 허용).
export const BODY_CONDITIONS = new Set([
  "great",
  "normal",
  "tired",
  "exhausted",
]);

// 코드값 → 한글 라벨. 지금까지는 값 집합(BODY_CONDITIONS)만 있으면 됐다 —
// 저장 시 검증만 했고 서버가 이 값을 사람에게 보여줄 일이 없었기 때문이다.
// 일간 보고서 알림톡(api/cron/daily-report.ts)이 「■ 오늘의 컨디션」 자리에
// 이 라벨을 그대로 싣는다. 없으면 학부모 문자에 'normal' 이 찍힌다.
// 위 두 맵과 같은 규칙 — studyRecordOptions.ts 의 CONDITION_OPTIONS 와 글자
// 단위로 같아야 하고, 그 패리티는 studyRecordOptions.test.ts 가 단언한다.
export const CONDITION_LABELS: Record<string, string> = {
  great: "아주 좋음",
  normal: "보통",
  tired: "피곤함",
  exhausted: "힘듦",
};

const MEMO_MAX_LENGTH = 1000;
const STUDY_HOURS_MAX = 24;

// QA3 행305 — 기록 제출 후 다시 제출(수정)할 수 없는 잠금 시간. "12시간 리터럴"
// 안(설계 문서 §5(c) B안, 팀장 작업 지시로 확정) — 자정 기준 당일 잠금(A안)이
// 아니라 제출 시각 + 12시간을 그대로 쓴다. 22시 제출 시 익일 10시까지 새 기록도
// 막히는 부작용이 있음을 알고 채택한 값이다(설계 문서 §5(c) 권고 A와 다름 — QA
// 최대 준수안 §9-4 채택).
const RECORD_COOLDOWN_MS = 12 * 60 * 60 * 1000;

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

/**
 * QA3 행305 — 쿨다운 판정 순수 함수. submittedAt이 없으면(아직 한 번도 제출한
 * 적 없는 학생) 잠금 없음. 경계는 "미만"만 잠금이다 — now - submittedAt이
 * 정확히 12시간이면(=== RECORD_COOLDOWN_MS) 이미 해제된 것으로 본다(테스트로
 * 고정: 11시간59분 거부, 12시간 정각 허용).
 */
export function computeCooldownState(
  submittedAt: string | null | undefined,
  now: Date,
): { active: boolean; submittedAt: string | null; unlocksAt: string | null } {
  if (!submittedAt)
    return { active: false, submittedAt: null, unlocksAt: null };

  const submittedMs = new Date(submittedAt).getTime();
  if (!Number.isFinite(submittedMs)) {
    return { active: false, submittedAt: null, unlocksAt: null };
  }

  const unlocksAtMs = submittedMs + RECORD_COOLDOWN_MS;
  const active = now.getTime() - submittedMs < RECORD_COOLDOWN_MS;

  return {
    active,
    submittedAt: new Date(submittedMs).toISOString(),
    unlocksAt: new Date(unlocksAtMs).toISOString(),
  };
}

/**
 * QA 행303·305 — 타이머 합산과 수기 입력값을 병합하는 정책. GET(mergeTimerIntoRecord)과
 * POST(studyHours 검증) 둘 다 같은 정책을 써야 해서 한 곳에 모았다 — 순수 계산만 한다
 * (DB 읽기/쓰기 없음, 부작용 없음).
 *
 * max를 쓰고 더하지 않는 이유: study_hours가 단일 컬럼이라 수기 입력분과 타이머
 * 측정분을 구분해 저장할 곳이 없다 — 학생이 타이머로 2시간을 재고 카드에서 "대략
 * 2시간"을 다시 수기로 입력(빠른 추가 칩)하면 단순 합산은 겹치는 시간을 이중
 * 계산한다. 타이머가 항상 최소 보장값이 되고, 수기 입력은 그 위로만 늘릴 수 있다.
 *
 * 호출부 주의: handlePost에서 이 함수가 돌려주는 값은 calculateDailyBonusV2의
 * studyHours 인자로 그대로 흘러간다 — 즉 타이머 시간이 확률 delta 계산에도 영향을
 * 준다(의도된 동작). 이 함수 자체는 그 계산을 하지 않고 시간 값만 병합한다.
 */
function mergeStudyHoursWithTimer(manualHours: number, timerHours: number) {
  return Math.max(manualHours, timerHours);
}

// ---------------------------------------------------------------------------
// 값 검증 헬퍼 (api/goal/intake.js 관례 재사용 — 화이트리스트 우선, 클라이언트 값 불신)
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNumericInput(raw: unknown) {
  return typeof raw === "number" || typeof raw === "string";
}

// unwrapped {status, body}를 돌려준다 — 호출부가 항상 `return { error: fail(...) }`
// 형태의 object literal로 감싸야 TS가 형제 프로퍼티를 undefined로 자동 추론해
// gate.error / tasksResult.error 접근이 좁혀진다(순수 타입 추론 편의, 런타임
// JSON 응답 바이트는 이전과 동일 — { error: { status, body } }).
function fail(status: number, body: Record<string, unknown>) {
  return { status, body };
}

function readBody(req: VercelRequest) {
  const body = req.body;
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/**
 * 코드값 배열 → 한글 라벨 배열. body 에 키 자체가 없으면(undefined) "미제출"로 보고
 * value:undefined 를 돌려준다(병합 단계에서 기존 값을 유지하는 신호) — 빈 배열([])과
 * 다르다(빈 배열은 "전부 지움"이라는 유효한 제출이다).
 */
function mapWhitelist(
  rawArray: unknown,
  labelMap: Record<string, string>,
  label: string,
) {
  if (rawArray === undefined) return { value: undefined };
  if (!Array.isArray(rawArray)) {
    return {
      error: fail(400, { detail: `${label} 형식이 올바르지 않습니다.` }),
    };
  }

  const mapped: string[] = [];
  for (const code of rawArray) {
    const mappedLabel = labelMap[String(code)];
    if (!mappedLabel) {
      return {
        error: fail(400, { detail: `${label}에 알 수 없는 값이 있습니다.` }),
      };
    }
    mapped.push(mappedLabel);
  }
  return { value: mapped };
}

// ---------------------------------------------------------------------------
// 학생 상태 게이트 — GET/POST 공용
// ---------------------------------------------------------------------------

/**
 * 온보딩 완료(status='active') 학생인지 확인한다. 아니면 409 를 돌려준다.
 * 순서 판단(둘 다 spec 문구 그대로): onboarded_at 이 null 이면(행 자체가 없는 경우
 * 포함) 애초에 온보딩을 완료한 적이 없는 것이라 'not_onboarded' — status='awaiting_cuts'
 * 행은 항상 onboarded_at 이 null 이므로(sql/55) 이 분기에서 함께 걸린다. onboarded_at
 * 은 있는데 status 가 'active' 가 아니면(paused) 'awaiting_cuts' 사유로 막는다.
 */
async function requireActiveStudent(
  // handleGet/handlePost가 session.error 체크를 통과한 뒤 narrowGoalSession()으로
  // 좁힌 값만 넘기므로 항상 존재한다(비-optional로 받는다).
  supabaseAdmin: NonNullable<GoalSession["supabaseAdmin"]>,
  profileId: NonNullable<GoalSession["profileId"]>,
) {
  const row = await fetchStudentRow(supabaseAdmin, profileId);

  if (!row?.onboarded_at) {
    return { error: fail(409, { reason: "not_onboarded" }) };
  }
  if (row.status !== "active") {
    return { error: fail(409, { reason: "awaiting_cuts" }) };
  }

  return { row };
}

// fetchTodayRecord/fetchStudentStateRow(api/_lib/goal/repo.ts, Stage3 대상)는 JSDoc
// @returns 타입 없이 raw DB row(any)를 그대로 돌려준다 — 이 두 빌더의 인자만
// any로 받는다(api/_lib/goal/repo.ts 자체는 수정하지 않는다).

/** DB 행(snake) → API 응답 record 블록(camel). GET/POST 응답이 완전히 같은 모양을 쓴다. */
// biome-ignore lint/suspicious/noExplicitAny: api/_lib/goal/repo.ts fetchTodayRecord가 타입을 내보내지 않는다(Stage3 대상).
function buildRecordPayload(row: any) {
  if (!row) return null;
  return {
    recordIndex: num(row.record_index),
    recordDate: row.record_date,
    studyHours: num(row.study_hours) ?? 0,
    bodyCondition: row.body_condition || "",
    tasks: row.tasks || [],
    reasons: row.reasons || [],
    memo: row.memo || "",
  };
}

// biome-ignore lint/suspicious/noExplicitAny: api/_lib/goal/repo.ts fetchStudentStateRow가 타입을 내보내지 않는다(Stage3 대상).
function buildProbsPayload(stateRow: any) {
  const state = stateRow || {};
  return {
    idealSusi: num(state.ideal_susi),
    idealJungsi: num(state.ideal_jungsi),
    minSusi: num(state.min_susi),
    minJungsi: num(state.min_jungsi),
  };
}

/**
 * QA3 행305 — 잠금 중 요약 패널용 데이터. GET이 소스로 넘기는 row는 "오늘
 * 행이 있으면 오늘 행, 없으면(자정을 넘겨 잠금만 남은 경우) 가장 최근 제출
 * 행"이다(호출부 결정, 이 함수는 순수 변환만). target_ideal_hours/
 * target_min_hours·delta_* 4종은 그 제출 시점의 스냅샷 컬럼을 그대로 쓴다 —
 * study_schedule이 나중에 바뀌어도 그날 산출 근거가 그대로 재현된다
 * (target_ideal_hours 컬럼 코멘트와 동일 이유).
 */
// biome-ignore lint/suspicious/noExplicitAny: api/_lib/goal/repo.ts fetchTodayRecord/fetchLatestDailyRecord가 타입을 내보내지 않는다(Stage3 대상).
export function buildSummaryPayload(row: any) {
  if (!row) return null;

  const studyHours = num(row.study_hours) ?? 0;
  const targetIdealHours = num(row.target_ideal_hours) ?? 0;
  const targetMinHours = num(row.target_min_hours) ?? 0;

  // Dashboard.tsx mapTodayGoal()의 rateOf와 동일 규칙(0~100 클램프, 반올림) —
  // 표시용 퍼센트를 두 곳에서 다르게 계산하지 않는다.
  const rateOf = (targetHours: number) =>
    targetHours > 0
      ? Math.min(100, Math.round((studyHours / targetHours) * 100))
      : 0;

  return {
    studyHours,
    targetIdealHours,
    targetMinHours,
    idealRate: rateOf(targetIdealHours),
    minRate: rateOf(targetMinHours),
    deltaIdealSusi: num(row.delta_ideal_susi),
    deltaMinSusi: num(row.delta_min_susi),
    // 정시 컷 미확보 학생은 rate_*_jungsi가 0이라 델타도 0으로 저장되지만(컬럼
    // NOT NULL), num()이 파싱 불가값을 null로 접는 방어 규칙은 여기서도 그대로
    // 둔다 — "정시 미산출"과 "0"을 클라이언트가 구분해야 할 여지를 남긴다.
    deltaIdealJungsi: num(row.delta_ideal_jungsi),
    deltaMinJungsi: num(row.delta_min_jungsi),
  };
}

/**
 * QA3 행305 — 잠금 패널에 보여줄 "내일 목표 시간". recordDate(오늘) 기준
 * +1일의 요일을 student.study_schedule에서 찾는다. 온보딩 전이거나 그 요일
 * 스케줄이 없으면 0/0(Dashboard.tsx resolveDaySchedule의 폴백과 동일 규칙).
 */
export function buildTomorrowTargets(
  // biome-ignore lint/suspicious/noExplicitAny: api/_lib/goal/repo.ts fetchStudentRow가 타입을 내보내지 않는다(Stage3 대상).
  student: any,
  recordDate: string,
  now: Date,
) {
  const tomorrowYmd = addDaysYMD(recordDate, 1, now);
  const dayIndex = getDayIndexFromYMDServer(tomorrowYmd, now);
  // biome-ignore lint/style/noNonNullAssertion: getDayIndexFromYMDServer는 항상 0-6을 돌려줌(7개 배열)
  const dayName = VIRTUAL_DAY_NAMES[dayIndex]!;
  const daySchedule = student?.study_schedule?.[dayName] || {
    ideal: 0,
    min: 0,
  };

  return {
    idealHours: num(daySchedule.ideal) ?? 0,
    minHours: num(daySchedule.min) ?? 0,
  };
}

// ---------------------------------------------------------------------------
// GET — 오늘(KST) 기록 조회(프리필용)
// ---------------------------------------------------------------------------

async function handleGet(
  _req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;

  // 조회형 규약 — student.js:50-53 과 동일하게 미결제는 에러가 아니다.
  if (!allowed) {
    return res.status(200).json({ allowed: false });
  }

  const { supabaseAdmin, profileId } = narrowGoalSession(session);

  const gate = await requireActiveStudent(supabaseAdmin, profileId);
  if (gate.error) {
    return res.status(gate.error.status).json(gate.error.body);
  }
  const student = gate.row;

  const now = new Date();
  const recordDate = kstYMD(now);

  const [record, stateRow, timerSummary, latestRecord] = await Promise.all([
    fetchTodayRecord(supabaseAdmin, profileId, recordDate),
    fetchStudentStateRow(supabaseAdmin, profileId),
    fetchTimerDaySummary(supabaseAdmin, profileId, now),
    fetchLatestDailyRecord(supabaseAdmin, profileId),
  ]);

  // QA3 행305 — cooldown은 한 번도 제출한 적 없으면 null(잠금 개념 자체가 없다).
  // 잠금 중 요약 패널의 소스는 "오늘 행이 있으면 오늘 행, 없으면(자정을 넘겨
  // 잠금만 남은 경우) 가장 최근 제출 행" — latestRecord가 곧 그 최근 행이다.
  const cooldown = latestRecord
    ? computeCooldownState(latestRecord.submitted_at, now)
    : null;
  const summary = buildSummaryPayload(record || latestRecord);
  const tomorrowTargets = buildTomorrowTargets(student, recordDate, now);

  return res.status(200).json({
    ok: true,
    record: mergeTimerIntoRecord(
      buildRecordPayload(record),
      recordDate,
      timerSummary,
    ),
    probs: buildProbsPayload(stateRow),
    // 과목별 순공 시간(시간 단위) — 열공 타이머(#25) 마감 세션 합계. DailyRecord.tsx는
    // 지금까지 별도로 GET /api/goal/timer를 불러 같은 데이터를 읽어 왔다(그쪽도 여전히
    // 정상 동작해 이번에 배선을 바꾸지 않았다) — 이 필드는 조회 응답 하나로도 총 순공
    // 시간과 과목별 내역을 함께 받을 수 있게 보강한 것이다(임무 지시 원칙 ③).
    subjectHours: timerSummary.subjects.map((row) => ({
      subject: row.subject,
      hours: round1(row.seconds / 3600),
    })),
    cooldown,
    summary,
    tomorrowTargets,
  });
}

/**
 * QA 행303·305 — 열공 타이머로 잰 시간이 오늘의 공부 기록·순공 시간에 반영되지 않던
 * 문제. dbRow(수기 입력값)와 timerSummary(#25 타이머 마감 세션 합계, 서버 파생)를
 * mergeStudyHoursWithTimer()로 합친다(병합 정책 근거는 그 함수 헤더 참고).
 *
 * DB 행이 아예 없어도(오늘 daily_records가 없지만 타이머는 돌렸다) 타이머 시간이
 * 있으면 record를 합성해 돌려준다 — recordIndex를 null로 남겨 "실제 저장된 행이
 * 아니다"를 클라이언트가 구분할 수 있게 한다(DailyRecord.tsx가 이 필드로
 * hasExistingRecord를 판정한다, "기록 수정"/"기록 저장" 버튼 문구가 실제 저장 여부와
 * 어긋나지 않도록).
 */
function mergeTimerIntoRecord(
  record: ReturnType<typeof buildRecordPayload>,
  recordDate: string,
  timerSummary: Awaited<ReturnType<typeof fetchTimerDaySummary>>,
) {
  const timerHours = round1(timerSummary.totalSeconds / 3600);

  if (record) {
    return {
      ...record,
      studyHours: mergeStudyHoursWithTimer(record.studyHours, timerHours),
    };
  }
  if (timerHours <= 0) return null;

  return {
    recordIndex: null,
    recordDate,
    studyHours: timerHours,
    bodyCondition: "",
    tasks: [],
    reasons: [],
    memo: "",
  };
}

// ---------------------------------------------------------------------------
// POST — 오늘 기록 upsert(부분 제출 허용, 재제출 = 갱신 + delta 재계산)
// ---------------------------------------------------------------------------

async function handlePost(
  req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;

  // 쓰기형이므로 미결제는 403 이다(intake.js:545-548 과 동일 규약).
  if (!allowed) {
    return res.status(403).json({ detail: PAID_MESSAGE });
  }

  const { supabaseAdmin, profileId } = narrowGoalSession(session);

  const gate = await requireActiveStudent(supabaseAdmin, profileId);
  if (gate.error) {
    return res.status(gate.error.status).json(gate.error.body);
  }
  const student = gate.row;

  const body = readBody(req);
  if (!isPlainObject(body)) {
    return res.status(400).json({ detail: "요청 본문이 올바르지 않습니다." });
  }

  const now = new Date();
  const recordDate = kstYMD(now);

  // 실제 달력 모델의 정본 계산 — "제출 N번째"가 아니라 시작일부터 실제 경과 일수.
  const recordIndex = diffDaysYMD(student.actual_start_date, recordDate, now);
  if (!Number.isFinite(recordIndex) || recordIndex < 0) {
    return res.status(400).json({ reason: "before_start_date" });
  }

  const [existing, timerSummary, latestRecord] = await Promise.all([
    fetchTodayRecord(supabaseAdmin, profileId, recordDate),
    fetchTimerDaySummary(supabaseAdmin, profileId, now),
    fetchLatestDailyRecord(supabaseAdmin, profileId),
  ]);

  // QA3 행305 — 12시간 쿨다운. 카드(studyHours만)·페이지(전체 필드) 두 제출
  // 경로 모두 이 한 곳을 거치므로 규칙이 자연히 공유된다. 오늘 행이 아직 없어도
  // (자정을 갓 넘겼는데 어제 밤 제출이 12시간 이내) latestRecord가 걸러낸다 —
  // fetchTodayRecord만으로는 이 경우를 잡지 못한다(오늘 행이 없으니 existing이
  // null이라 통과해 버린다).
  const cooldown = latestRecord
    ? computeCooldownState(latestRecord.submitted_at, now)
    : null;
  if (cooldown?.active) {
    return res.status(409).json({
      reason: "cooldown",
      submittedAt: cooldown.submittedAt,
      unlocksAt: cooldown.unlocksAt,
    });
  }

  const timerHours = round1(timerSummary.totalSeconds / 3600);

  // ── 병합 — 바디에 있는 필드만 교체, 없으면 기존 행 값 유지 ────────────────
  const tasksResult = mapWhitelist(body.tasks, TASK_LABELS, "학습 항목");
  if (tasksResult.error)
    return res.status(tasksResult.error.status).json(tasksResult.error.body);

  const reasonsResult = mapWhitelist(body.reasons, REASON_LABELS, "방해 요인");
  if (reasonsResult.error)
    return res
      .status(reasonsResult.error.status)
      .json(reasonsResult.error.body);

  const tasks =
    tasksResult.value !== undefined ? tasksResult.value : existing?.tasks || [];
  const reasons =
    reasonsResult.value !== undefined
      ? reasonsResult.value
      : existing?.reasons || [];

  // bodyCondition — 신규 값이 오면 화이트리스트 검증, 없으면 기존 값 유지, 그마저
  // 없으면(오늘 첫 제출이 카드-only) ''(빈 문자열)로 둔다. bonusV2 는 ''를
  // CONDITION_MULTIPLIER 미매칭 → normal(1.0) 로 적용한다(팀장 지시 "카드 최초 제출은
  // condition 미보유 허용" 규칙).
  let bodyCondition: string;
  if (body.bodyCondition !== undefined) {
    // Set.has()는 런타임에 타입이 달라도(string이 아니어도) 그냥 false를 준다 —
    // as string은 그 동작을 바꾸지 않고 TS 인자 타입만 맞춘다.
    if (!BODY_CONDITIONS.has(body.bodyCondition as string)) {
      return res.status(400).json({ detail: "컨디션 값이 올바르지 않습니다." });
    }
    bodyCondition = body.bodyCondition as string;
  } else {
    bodyCondition = existing?.body_condition || "";
  }

  // memo — trim + 1000자 컷. 신규 값이 없으면 기존 값 유지.
  let memo: string;
  if (body.memo !== undefined) {
    if (typeof body.memo !== "string") {
      return res.status(400).json({ detail: "메모 형식이 올바르지 않습니다." });
    }
    memo = body.memo.trim().slice(0, MEMO_MAX_LENGTH);
  } else {
    memo = existing?.memo || "";
  }

  // studyHours — 병합 결과에 최종 검증을 건다(부분 제출이라 "이 요청에 studyHours가
  // 없었다"와 "0시간을 제출했다"를 구분해야 한다 — 후자만 명시적 400 사유를 준다).
  let studyHoursInput: number;
  if (body.studyHours !== undefined) {
    if (!isNumericInput(body.studyHours)) {
      return res
        .status(400)
        .json({ detail: "순공 시간 형식이 올바르지 않습니다." });
    }
    studyHoursInput = Number(body.studyHours);
  } else {
    studyHoursInput = num(existing?.study_hours) ?? 0;
  }

  // QA 행303·305 — 열공 타이머로 잰 시간을 여기서도 반영한다(병합 정책은
  // mergeStudyHoursWithTimer 헤더 참고, GET(mergeTimerIntoRecord)과 동일). 이게 없으면
  // "오늘의 공부 기록" 페이지(#26, studyHours를 아예 입력받지 않는다)가
  // existing?.study_hours만 보고, 타이머만 쓰고 카드에서 수기 입력을 한 번도 안 한
  // 학생은 항상 0으로 떨어져 아래 no_study_time 게이트에 막힌다.
  studyHoursInput = mergeStudyHoursWithTimer(studyHoursInput, timerHours);

  if (
    !Number.isFinite(studyHoursInput) ||
    studyHoursInput <= 0 ||
    studyHoursInput > STUDY_HOURS_MAX
  ) {
    return res.status(400).json({ reason: "no_study_time" });
  }
  const studyHours = Math.round(studyHoursInput * 10) / 10;

  // ── 오늘 적용 목표 시간 스냅샷 — study_schedule[요일] ──────────────────
  const dayIndex = getDayIndexFromYMDServer(recordDate, now);
  // biome-ignore lint/style/noNonNullAssertion: getDayIndexFromYMDServer는 항상 0-6을 돌려줌(7개 배열)
  const dayName = VIRTUAL_DAY_NAMES[dayIndex]!;
  const daySchedule = student.study_schedule?.[dayName] || {
    ideal: 0,
    min: 0,
  };
  const idealHours = num(daySchedule.ideal) ?? 0;
  const minHours = num(daySchedule.min) ?? 0;

  // ── 수식 v2 — rate 는 온보딩 시 1회 산출된 값(goal_students.rate_*). 정시 컷이
  // 없어 null 인 학생은 0 취급(그 목표엔 애초에 게이지가 없다, jungsiAvailable=false
  // 와 동일한 판정, api/_lib/goal/repo.ts buildStudentPayload 참고).
  const delta = calculateDailyBonusV2({
    idealSusiRate: num(student.rate_ideal_susi) ?? 0,
    idealJungsiRate: num(student.rate_ideal_jungsi) ?? 0,
    minSusiRate: num(student.rate_min_susi) ?? 0,
    minJungsiRate: num(student.rate_min_jungsi) ?? 0,
    condition: bodyCondition,
    tasks,
    studyHours,
    idealHours,
    minHours,
  });

  const payload = {
    profile_id: profileId,
    record_index: recordIndex,
    record_date: recordDate,
    submitted_on: kstYMD(now),
    // QA3 행305 — 다음 12시간 쿨다운의 기준점. 이 값이 곧 위 cooldown 게이트가
    // 다음 요청에서 읽는 latestRecord.submitted_at이다.
    submitted_at: now.toISOString(),

    study_hours: studyHours,
    achievement: "",
    focus: "",
    body_condition: bodyCondition,
    reasons,
    tasks,
    memo,

    target_ideal_hours: idealHours,
    target_min_hours: minHours,

    delta_ideal_susi: delta.idealSusiBonus,
    delta_ideal_jungsi: delta.idealJungsiBonus,
    delta_min_susi: delta.minSusiBonus,
    delta_min_jungsi: delta.minJungsiBonus,
  };

  const savedRow = await upsertDailyRecord(supabaseAdmin, payload);

  const stateRow = await fetchStudentStateRow(supabaseAdmin, profileId);
  const probs = buildProbsPayload(stateRow);

  await appendProbabilityLog(
    supabaseAdmin,
    profileId,
    probs,
    "daily_record",
    savedRow.id,
  );

  return res.status(200).json({
    ok: true,
    record: buildRecordPayload(savedRow),
    delta: {
      idealSusi: delta.idealSusiBonus,
      idealJungsi: delta.idealJungsiBonus,
      minSusi: delta.minSusiBonus,
      minJungsi: delta.minJungsiBonus,
    },
    probs,
    recordCount: num(stateRow?.record_count) ?? 0,
  });
}

// ---------------------------------------------------------------------------
// 핸들러
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return sendError(res, "detail", 405, "Method not allowed");
  }

  try {
    const session = await openGoalSession(req);
    if (session.error) {
      return sendError(
        res,
        "detail",
        session.error.status,
        session.error.body.detail as string,
      );
    }

    if (req.method === "GET") {
      return await handleGet(req, res, session);
    }
    return await handlePost(req, res, session);
  } catch (error) {
    console.error("goal/daily-record error:", error);
    return sendError(res, "detail", 500, "처리 중 오류가 발생했습니다.");
  }
}
