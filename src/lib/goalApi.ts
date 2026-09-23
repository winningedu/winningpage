// GET /api/goal/student · POST /api/goal/intake 공용 클라이언트.
//
// src/lib/entitlement.js의 hasEntitlement()와 같은 패턴(세션 조회 → 세션 없으면 조기
// 반환 → fetch → 안전한 JSON 파싱 → 상태코드 분기)을 따른다. entitlement.js는 참고만
// 하고 수정하지 않는다 — 이 파일은 그 패턴을 목표관리 API 두 엔드포인트에 맞춰
// 새로 구현한 것이다(공유 코드 추출은 하지 않는다 — 두 파일이 다루는 엔드포인트·응답
// 모양이 달라 무리하게 합치면 오히려 각 파일의 분기 로직이 서로의 사정을 끌어안게 된다).
//
// 두 함수 모두 예외를 던지지 않는다 — 실패도 반환값(discriminated union)으로 표현한다.
// 호출부(goalOnboarding.js, RequireGoalAccess.jsx, Onboarding.jsx, 이후 대시보드)는
// `kind` 필드로 분기한다. 원본 서버 응답에도 `status` 필드가 있어(§goal-schema-design
// row.status: 'active' | 'awaiting_cuts') 이름이 겹치면 혼동되므로, 이 래퍼의 판별자는
// 의도적으로 `status`가 아니라 `kind`로 둔다.

import { apiFetch, getAuthHeader } from "./apiFetch";

// ---------------------------------------------------------------------------
// 응답 payload 타입 — api/_lib/goalRepo.js buildXxxPayload()/api/goal/*.ts 응답 조립과
// 실제 select 컬럼(카멜 변환 후)에 맞춰 정의한다.
// ---------------------------------------------------------------------------

interface GoalTargetBlock {
  university: string;
  department: string;
  naesinCut: number | null;
  jungsiCut: number | null;
}

interface GoalTargets {
  ideal: GoalTargetBlock;
  min: GoalTargetBlock;
}

interface GoalProbabilityHistoryEntry {
  recordedAt: string;
  idealSusi: number | null;
  idealJungsi: number | null;
  minSusi: number | null;
  minJungsi: number | null;
}

/** GET /api/goal/student 200 본문(온보딩 완료 학생) — api/_lib/goalRepo.js buildStudentPayload(). */
export interface GoalStudentPayload {
  onboarded: true;
  status: string;
  profile: {
    name: string | null;
    schoolType: string;
    grade: string;
    schoolCutType: string;
  };
  targets: GoalTargets;
  scores: {
    currentScore: number | null;
    convertedGrade: number | null;
    currentMogo: number | null;
    remainNaesin: number | null;
    remainMogo: number | null;
    lastNaesinExam: string;
    lastMogoExam: string;
  };
  baseProbs: {
    idealSusi: number | null;
    idealJungsi: number | null;
    minSusi: number | null;
    minJungsi: number | null;
  };
  rates: {
    idealSusiBonus: number | null;
    idealJungsiBonus: number | null;
    minSusiBonus: number | null;
    minJungsiBonus: number | null;
  };
  cumulativeBonus: {
    idealSusi: number;
    idealJungsi: number;
    minSusi: number;
    minJungsi: number;
  };
  probs: {
    idealSusi: number | null;
    idealJungsi: number | null;
    minSusi: number | null;
    minJungsi: number | null;
  };
  weeklySchedule: Record<string, unknown>;
  weekIdeal: number;
  weekMin: number;
  actualStartDate: string | null;
  recordCount: number;
  lastRecordDate: string | null;
  jungsiAvailable: boolean;
  probabilityHistory: GoalProbabilityHistoryEntry[];
  /** 최근 7일 goal_daily_records 순공시간 평균. 기록 0건이면 null(억지 산출 금지). */
  recentAvgStudyHours: number | null;
  /** 내 정보 수정(내 목표 대학·내 정보 수정 화면) 폼 hydration 전용 — 원본 입력값. */
  targetInput: {
    ideal: { university: string; department: string };
    min: { university: string; department: string };
  };
  /** naesin_scores 원본(intake.ts 저장 모양) — 없으면 아직 저장된 적 없음. */
  naesinInput: Record<string, unknown> | null;
  /** mock_exam_scores 원본(intake.ts 저장 모양) — 없으면 아직 저장된 적 없음. */
  mockInput: Record<string, unknown> | null;
}

/** 오늘 확률 스냅샷 — api/goal/daily-record.ts buildProbsPayload(). */
interface GoalProbsBlock {
  idealSusi: number | null;
  idealJungsi: number | null;
  minSusi: number | null;
  minJungsi: number | null;
}

/** api/goal/daily-record.ts buildRecordPayload(). */
interface GoalDailyRecord {
  recordIndex: number | null;
  recordDate: string;
  studyHours: number;
  bodyCondition: string;
  tasks: string[];
  reasons: string[];
  memo: string;
}

/**
 * QA3 행305 — api/goal/daily-record.ts computeCooldownState(). 한 번도 제출한
 * 적 없는 학생은 null(잠금 개념 자체가 없다).
 */
export interface GoalRecordCooldown {
  active: boolean;
  submittedAt: string | null;
  unlocksAt: string | null;
}

/**
 * QA3 행305 — api/goal/daily-record.ts buildSummaryPayload(). 잠금 중 요약
 * 패널 전용, 오늘/가장 최근 제출 행이 하나도 없으면 null.
 */
export interface GoalRecordSummary {
  studyHours: number;
  targetIdealHours: number;
  targetMinHours: number;
  idealRate: number;
  minRate: number;
  deltaIdealSusi: number | null;
  deltaMinSusi: number | null;
  deltaIdealJungsi: number | null;
  deltaMinJungsi: number | null;
}

/** QA3 행305 — api/goal/daily-record.ts buildTomorrowTargets(). */
export interface GoalTomorrowTargets {
  idealHours: number;
  minHours: number;
}

/** api/_lib/goalRepo.js buildSchedulePayload(). */
interface GoalSchedule {
  id: number;
  title: string;
  category: string;
  dueDate: string;
  memo: string;
}

/**
 * api/_lib/goalRepo.js buildPlanTaskPayload(). status가 단일 원본(QA 행305,
 * pending/done/fail) — done은 status에서 파생한 하위 호환 값이다.
 */
export interface GoalPlanTask {
  id: number;
  planDate: string;
  title: string;
  subject: string;
  durationMinutes: number;
  status: "pending" | "done" | "fail";
  done: boolean;
  sortOrder: number;
  // 문제집 연결(QA 행286-B), 셋 다 선택 — 연결이 없으면 전부 null.
  workbookId: number | null;
  pageFrom: number | null;
  pageTo: number | null;
  workbookTitle: string | null;
}

/** api/_lib/goalRepo.js buildWorkbookPayload(). */
interface GoalWorkbook {
  id: number;
  subject: string;
  title: string;
  totalPages: number | null;
  currentPage: number | null;
  status: string;
  // "책장에 꽂기" 수동 전이(Figma 4026:6046) — null이면 status='done'이어도 아직
  // BookStack에 안 옮겨진 상태.
  shelvedAt: string | null;
}

/** GET /api/goal/timer 응답의 summary 블록(camelCase). api/goal/timer.ts 참고. */
interface GoalTimerSummary {
  date: string;
  serverNow: string;
  running: { subject: string; startedAt: string } | null;
  subjects: { subject: string; seconds: number }[];
  totalSeconds: number;
  targets: { subject: string; targetHours: number }[];
  // 학생이 타이머 화면에 노출 중인 과목 목록(정렬 순, QA B9 "+ 과목 추가"). 행이 없으면
  // 서버가 기본 4과목을 돌려준다(api/_lib/goalRepo.ts DEFAULT_TIMER_SUBJECTS).
  visibleSubjects: string[];
}

/** fetchGoalGrades()/addGoalGrade() 회차 레코드 — api/goal/grades.ts validateEntry 참고. */
interface GoalGradeRecord {
  term: string;
  enteredAt?: string;
  examDate?: string;
  subjects: {
    korean: number | string;
    math: number | string;
    english: number | string;
    science: number | string;
  };
  value: number;
  none: boolean;
  recordedAt: string;
}

// 응답 본문 shape은 엔드포인트별로 다르고 파싱 실패 시 {}로 접히므로 any로 둔다 —
// 각 호출부가 옵셔널 체이닝으로 안전하게 좁혀 쓴다(아래 discriminated union 반환
// 타입이 실제 계약이고, 여기서는 그 값을 만드는 재료일 뿐이다).
/** 응답 본문을 안전하게 JSON으로 파싱한다 — 파싱 실패는 빈 객체로 접는다. */
// biome-ignore lint/suspicious/noExplicitAny: 엔드포인트마다 응답 모양이 다른 원시 JSON.
async function parseJsonSafe(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// fetchGoalStudent — GET /api/goal/student
// ---------------------------------------------------------------------------
//
// 반환 계약(discriminated union, `kind` 필드로 분기). 이후 대시보드 배선 단계가 이
// 함수를 그대로 재사용하므로 shape을 안정적으로 유지한다.
//
//   { kind: 'no-session' }
//     — 세션 자체가 없거나(로컬 판정) 서버가 401을 준 경우. 호출부는 /login으로
//       보내거나 로그인 필요 UI를 그린다.
//
//   { kind: 'error' }
//     — 판정 불가: 네트워크 오류, JSON 파싱 실패, 5xx, 405, 예상 밖 상태코드 등.
//       hasEntitlement()의 null과 동일한 의미 — 절대 'not-onboarded'/'not-allowed'로
//       단정해 리다이렉트하지 말 것. 재시도 UI로 연결해야 한다.
//
//   { kind: 'not-allowed' }
//     — 200 {allowed:false}. 이용권 없음.
//
//   { kind: 'not-onboarded' }
//     — 200 {onboarded:false} (status 필드 없음). 온보딩 시도 자체가 없음.
//
//   { kind: 'awaiting-cuts', status, targets, missingCuts }
//     — 200 {onboarded:false, status:'awaiting_cuts', targets, missingCuts}.
//       제출은 완료했으나 목표 대학 컷 데이터가 없어 확률이 아직 산출되지 않음.
//       status는 서버 원문 문자열을 그대로 싣는다('awaiting_cuts').
//
//   { kind: 'onboarded', student }
//     — 200 {onboarded:true, ...}. student는 api/_lib/goalRepo.js의
//       buildStudentPayload() 반환 객체 전체를 그대로 담는다:
//       { onboarded, status, profile:{name,schoolType,grade,schoolCutType},
//         targets, scores, baseProbs, rates, cumulativeBonus, probs,
//         weeklySchedule, weekIdeal, weekMin, actualStartDate, recordCount,
//         lastRecordDate, jungsiAvailable, probabilityHistory, recentAvgStudyHours }
//       probabilityHistory: {recordedAt, idealSusi, idealJungsi, minSusi, minJungsi}[]
//       — 오래된 순. "학업 성취도 변화 추이" 차트(AchievementChart) 전용.
export type FetchGoalStudentResult =
  | { kind: "no-session" }
  | { kind: "error" }
  | { kind: "not-allowed" }
  | { kind: "not-onboarded" }
  | {
      kind: "awaiting-cuts";
      status: string;
      targets: GoalTargets;
      missingCuts: string[];
    }
  | { kind: "onboarded"; student: GoalStudentPayload };

export async function fetchGoalStudent(): Promise<FetchGoalStudentResult> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { kind: "no-session" };

  let response: Response;
  try {
    response = await apiFetch("/api/goal/student", {
      method: "GET",
      headers: authHeader,
    });
  } catch (error) {
    console.error("[goalApi] GET /api/goal/student 호출 오류:", error);
    return { kind: "error" };
  }

  if (response.status === 401) return { kind: "no-session" };

  if (!response.ok) {
    console.error("[goalApi] GET /api/goal/student 실패:", response.status);
    return { kind: "error" };
  }

  const body = await parseJsonSafe(response);

  if (body?.allowed === false) return { kind: "not-allowed" };

  if (body?.onboarded === true) {
    return { kind: "onboarded", student: body };
  }

  if (body?.onboarded === false) {
    if (body.status === "awaiting_cuts") {
      return {
        kind: "awaiting-cuts",
        status: body.status,
        targets: body.targets,
        missingCuts: body.missingCuts,
      };
    }
    return { kind: "not-onboarded" };
  }

  // 예상 밖 응답 모양 — 판정 불가로 접는다.
  console.error("[goalApi] GET /api/goal/student 예상 밖 응답 모양:", body);
  return { kind: "error" };
}

// ---------------------------------------------------------------------------
// submitGoalIntake — POST /api/goal/intake
// ---------------------------------------------------------------------------
//
// 반환 계약(discriminated union, `kind` 필드로 분기):
//
//   { kind: 'no-session' }             — 401. /login으로.
//   { kind: 'not-allowed' }            — 403. /pricing?service=goal로.
//   { kind: 'success', student }       — 200. student = buildStudentPayload() 전체
//                                         (fetchGoalStudent의 kind:'onboarded'.student와 동일 모양).
//   { kind: 'already-onboarded' }      — 409 reason:'already_onboarded'. 성공과 동일하게 취급.
//   { kind: 'cuts-missing', missing }  — 422 reason:'cut_not_found'. 입력은 서버에 이미
//                                         저장됨(status='awaiting_cuts') — 온보딩 화면에 머무르되
//                                         계산 오버레이는 띄우지 않는다.
//   { kind: 'validation-error', detail } — 400. 정상 경로에선 나오지 않아야 하는 방어적 분기.
//   { kind: 'error' }                  — 500 / 네트워크 오류 / 예상 밖 상태코드. 재시도 가능,
//                                         입력을 지우지 않는다.
export type SubmitGoalIntakeResult =
  | { kind: "no-session" }
  | { kind: "not-allowed" }
  | { kind: "success"; student: GoalStudentPayload }
  | { kind: "already-onboarded" }
  | { kind: "cuts-missing"; missing: string[] }
  | { kind: "validation-error"; detail: string }
  | { kind: "error" };

// intake 설문 본문(7단계 폼) — 서버가 zod로 검증하는 실제 계약(api/goal/intake.ts)이라
// 클라이언트 쪽에서 이중으로 좁게 규정하지 않는다(과잉 제약 방지, 판단 지점).
export async function submitGoalIntake(
  body: object,
): Promise<SubmitGoalIntakeResult> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { kind: "no-session" };

  let response: Response;
  try {
    response = await apiFetch("/api/goal/intake", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error("[goalApi] POST /api/goal/intake 호출 오류:", error);
    return { kind: "error" };
  }

  const result = await parseJsonSafe(response);

  if (response.status === 200) {
    return { kind: "success", student: result?.student };
  }

  if (response.status === 409) return { kind: "already-onboarded" };

  if (response.status === 422) {
    return { kind: "cuts-missing", missing: result?.missing };
  }

  if (response.status === 400) {
    return { kind: "validation-error", detail: result?.detail };
  }

  if (response.status === 401) return { kind: "no-session" };
  if (response.status === 403) return { kind: "not-allowed" };

  console.error(
    "[goalApi] POST /api/goal/intake 실패:",
    response.status,
    result?.detail,
  );
  return { kind: "error" };
}

// ---------------------------------------------------------------------------
// submitGoalIntakeUpdate — POST /api/goal/intake-update
// ---------------------------------------------------------------------------
//
// 내 정보 수정(QA 2차 시트 행25・31・32) — 목표대학/내신/모의고사 중 한 section만
// 부분 수정한다. 반환 계약은 submitGoalIntake와 같은 관례를 따른다.
export type SubmitGoalIntakeUpdateResult =
  | { kind: "no-session" }
  | { kind: "not-allowed" }
  | { kind: "success"; student: GoalStudentPayload }
  | { kind: "not-onboarded" }
  | { kind: "cuts-missing"; missing: string[] }
  | { kind: "validation-error"; detail: string }
  | { kind: "error" };

export async function submitGoalIntakeUpdate(
  body: object,
): Promise<SubmitGoalIntakeUpdateResult> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { kind: "no-session" };

  let response: Response;
  try {
    response = await apiFetch("/api/goal/intake-update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error("[goalApi] POST /api/goal/intake-update 호출 오류:", error);
    return { kind: "error" };
  }

  const result = await parseJsonSafe(response);

  if (response.status === 200) {
    return { kind: "success", student: result?.student };
  }

  if (response.status === 404) return { kind: "not-onboarded" };

  if (response.status === 422) {
    return { kind: "cuts-missing", missing: result?.missing };
  }

  if (response.status === 400) {
    return { kind: "validation-error", detail: result?.detail };
  }

  if (response.status === 401) return { kind: "no-session" };
  if (response.status === 403) return { kind: "not-allowed" };

  console.error(
    "[goalApi] POST /api/goal/intake-update 실패:",
    response.status,
    result?.detail,
  );
  return { kind: "error" };
}

// ---------------------------------------------------------------------------
// fetchTodayGoalRecord — GET /api/goal/daily-record
// ---------------------------------------------------------------------------
//
// 반환 계약(discriminated union, `kind` 필드로 분기):
//
//   { kind: 'no-session' }              — 401.
//   { kind: 'not-allowed' }             — 200 {allowed:false}. 이용권 없음.
//   { kind: 'not-active' }              — 409 reason:'not_onboarded'|'awaiting_cuts'.
//                                          정상 경로에선 RequireGoalAccess가 이미
//                                          걸러 도달하지 않는 방어적 분기(intake.js와
//                                          동일 사유).
//   { kind: 'success', record, probs, cooldown, summary, tomorrowTargets }
//                                        — 200 {ok:true, ...}. record는 오늘 기록이
//                                          없으면 null(api/goal/daily-record.js
//                                          buildRecordPayload 계약). cooldown/
//                                          summary/tomorrowTargets는 QA3 행305
//                                          쿨다운·잠금 패널 전용(둘 다 한 번도
//                                          제출한 적 없으면 cooldown/summary는 null).
//   { kind: 'error' }                   — 네트워크 오류·JSON 파싱 실패·5xx·예상 밖 상태코드.
export type FetchTodayGoalRecordResult =
  | { kind: "no-session" }
  | { kind: "not-allowed" }
  | { kind: "not-active" }
  | {
      kind: "success";
      record: GoalDailyRecord | null;
      probs: GoalProbsBlock;
      cooldown: GoalRecordCooldown | null;
      summary: GoalRecordSummary | null;
      tomorrowTargets: GoalTomorrowTargets;
    }
  | { kind: "error" };

export async function fetchTodayGoalRecord(): Promise<FetchTodayGoalRecordResult> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { kind: "no-session" };

  let response: Response;
  try {
    response = await apiFetch("/api/goal/daily-record", {
      method: "GET",
      headers: authHeader,
    });
  } catch (error) {
    console.error("[goalApi] GET /api/goal/daily-record 호출 오류:", error);
    return { kind: "error" };
  }

  if (response.status === 401) return { kind: "no-session" };
  if (response.status === 409) return { kind: "not-active" };

  if (!response.ok) {
    console.error(
      "[goalApi] GET /api/goal/daily-record 실패:",
      response.status,
    );
    return { kind: "error" };
  }

  const body = await parseJsonSafe(response);

  if (body?.allowed === false) return { kind: "not-allowed" };

  if (body?.ok === true) {
    return {
      kind: "success",
      record: body.record ?? null,
      probs: body.probs,
      cooldown: body.cooldown ?? null,
      summary: body.summary ?? null,
      tomorrowTargets: body.tomorrowTargets ?? { idealHours: 0, minHours: 0 },
    };
  }

  console.error(
    "[goalApi] GET /api/goal/daily-record 예상 밖 응답 모양:",
    body,
  );
  return { kind: "error" };
}

// ---------------------------------------------------------------------------
// submitDailyRecord — POST /api/goal/daily-record
// ---------------------------------------------------------------------------
//
// body는 부분 제출을 허용한다 — { studyHours?, bodyCondition?, reasons?, tasks?, memo? }.
// 대시보드 카드는 { studyHours }만, "오늘의 공부 기록" 페이지는 나머지 필드(+선택적
// studyHours)를 보낸다(api/goal/daily-record.js 헤더 "부분 제출" 절과 동일 계약).
//
// 반환 계약(discriminated union, `kind` 필드로 분기):
//
//   { kind: 'no-session' }                  — 401.
//   { kind: 'not-allowed' }                 — 403. 이용권 없음.
//   { kind: 'not-active' }                  — 409 reason:'not_onboarded'|'awaiting_cuts'.
//   { kind: 'no-study-time' }               — 400 reason:'no_study_time'. 순공 시간이
//                                              0(이거나 미기록)이라 저장할 수 없음 —
//                                              DailyRecord.jsx가 이 kind를 받으면
//                                              시간 섹션으로 스크롤+안내한다.
//   { kind: 'before-start-date' }           — 400 reason:'before_start_date'. 방어적
//                                              분기(정상 입력으로는 발생하지 않는다).
//   { kind: 'validation-error', detail }    — 그 외 400(잘못된 컨디션·태그 코드 등).
//   { kind: 'success', record, delta, probs, recordCount } — 200 {ok:true, ...}.
//   { kind: 'error' }                       — 네트워크 오류·5xx·예상 밖 상태코드.
interface SubmitDailyRecordBody {
  studyHours?: number;
  bodyCondition?: string;
  reasons?: string[];
  tasks?: string[];
  memo?: string;
}

export type SubmitDailyRecordResult =
  | { kind: "no-session" }
  | { kind: "not-allowed" }
  | { kind: "not-active" }
  | { kind: "no-study-time" }
  | { kind: "before-start-date" }
  // QA3 행305 — 12시간 쿨다운 중 재제출. api/goal/daily-record.ts 409 {reason:'cooldown'}.
  | { kind: "cooldown"; submittedAt: string | null; unlocksAt: string | null }
  | { kind: "validation-error"; detail: string }
  | {
      kind: "success";
      record: GoalDailyRecord;
      delta: GoalProbsBlock;
      probs: GoalProbsBlock;
      recordCount: number;
    }
  | { kind: "error" };

export async function submitDailyRecord(
  body: SubmitDailyRecordBody,
): Promise<SubmitDailyRecordResult> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { kind: "no-session" };

  let response: Response;
  try {
    response = await apiFetch("/api/goal/daily-record", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error("[goalApi] POST /api/goal/daily-record 호출 오류:", error);
    return { kind: "error" };
  }

  const result = await parseJsonSafe(response);

  if (response.status === 200) {
    return {
      kind: "success",
      record: result?.record,
      delta: result?.delta,
      probs: result?.probs,
      recordCount: result?.recordCount,
    };
  }

  if (response.status === 401) return { kind: "no-session" };
  if (response.status === 403) return { kind: "not-allowed" };
  if (response.status === 409) {
    // QA3 행305 — 409는 requireActiveStudent(not_onboarded/awaiting_cuts)와
    // 쿨다운 게이트가 공유한다. reason으로만 구분한다.
    if (result?.reason === "cooldown") {
      return {
        kind: "cooldown",
        submittedAt: result?.submittedAt ?? null,
        unlocksAt: result?.unlocksAt ?? null,
      };
    }
    return { kind: "not-active" };
  }

  if (response.status === 400) {
    if (result?.reason === "no_study_time") return { kind: "no-study-time" };
    if (result?.reason === "before_start_date")
      return { kind: "before-start-date" };
    return { kind: "validation-error", detail: result?.detail };
  }

  console.error(
    "[goalApi] POST /api/goal/daily-record 실패:",
    response.status,
    result?.detail,
  );
  return { kind: "error" };
}

// ---------------------------------------------------------------------------
// 문제집(goal_workbooks) — "나의 노력" 화면(Efforts.jsx) 전용 CRUD.
// 4함수 모두 위 두 함수와 같은 규약을 따른다: 예외를 던지지 않고 discriminated
// union으로 실패를 표현하며, 응답 본문은 api/_lib/goalRepo.js buildWorkbookPayload
// 모양 그대로다({ id, subject, title, totalPages, currentPage, status }).
//
// 공통 kind:
//   { kind: 'no-session' }              — 401. /login으로.
//   { kind: 'not-allowed' }             — GET 200 {allowed:false} 또는 쓰기형 403. /pricing?service=goal로.
//   { kind: 'validation-error', detail } — 400. 정상 경로에선 나오지 않아야 하는 방어적 분기.
//   { kind: 'not-found' }               — 404(PUT/DELETE 전용). 이미 지워졌거나 남의 문제집.
//   { kind: 'error' }                   — 500 / 네트워크 오류 / 예상 밖 상태코드.
// ---------------------------------------------------------------------------

type GoalWorkbooksRequestResult =
  | { kind: "no-session" }
  | { kind: "not-allowed" }
  | { kind: "not-found" }
  | { kind: "validation-error"; detail: string }
  | { kind: "error" }
  // biome-ignore lint/suspicious/noExplicitAny: 안전 파싱된 원시 JSON 그대로 넘긴다 — 각 wrapper가 필요한 필드만 좁혀 쓴다.
  | { kind: "success"; result: any };

async function goalWorkbooksRequest(
  method: string,
  body?: object,
): Promise<GoalWorkbooksRequestResult> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { kind: "no-session" };

  let response: Response;
  try {
    response = await apiFetch("/api/goal/workbooks", {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...authHeader,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    console.error(`[goalApi] ${method} /api/goal/workbooks 호출 오류:`, error);
    return { kind: "error" };
  }

  if (response.status === 401) return { kind: "no-session" };
  if (response.status === 403) return { kind: "not-allowed" };
  if (response.status === 404) return { kind: "not-found" };

  const result = await parseJsonSafe(response);

  if (response.status === 400)
    return { kind: "validation-error", detail: result?.detail };

  if (!response.ok) {
    console.error(
      `[goalApi] ${method} /api/goal/workbooks 실패:`,
      response.status,
      result?.detail,
    );
    return { kind: "error" };
  }

  if (result?.allowed === false) return { kind: "not-allowed" };

  return { kind: "success", result };
}

/** GET — 본인 문제집 전체 목록. */
export async function fetchGoalWorkbooks(): Promise<
  | Exclude<GoalWorkbooksRequestResult, { kind: "success" }>
  | { kind: "success"; workbooks: GoalWorkbook[] }
> {
  const outcome = await goalWorkbooksRequest("GET");
  if (outcome.kind !== "success") return outcome;
  return { kind: "success", workbooks: outcome.result?.workbooks ?? [] };
}

interface GoalWorkbookInput {
  subject: string;
  title: string;
  totalPages: number;
  currentPage?: number;
}

/** POST — 문제집 1건 등록. payload: {subject, title, totalPages, currentPage?}. */
export async function createGoalWorkbook(
  payload: GoalWorkbookInput,
): Promise<
  | Exclude<GoalWorkbooksRequestResult, { kind: "success" }>
  | { kind: "success"; workbook: GoalWorkbook }
> {
  const outcome = await goalWorkbooksRequest("POST", payload);
  if (outcome.kind !== "success") return outcome;
  return { kind: "success", workbook: outcome.result?.workbook };
}

/** PUT — 문제집 1건 수정. payload: {id, title?, totalPages?, currentPage?}. */
export async function updateGoalWorkbook(
  payload: { id: number } & Partial<
    Pick<GoalWorkbookInput, "title" | "totalPages" | "currentPage">
  >,
): Promise<
  | Exclude<GoalWorkbooksRequestResult, { kind: "success" }>
  | { kind: "success"; workbook: GoalWorkbook }
> {
  const outcome = await goalWorkbooksRequest("PUT", payload);
  if (outcome.kind !== "success") return outcome;
  return { kind: "success", workbook: outcome.result?.workbook };
}

/**
 * PUT {id, shelve:true} — "완독! 책장에 꽂기". status='done'인 문제집만 허용되고,
 * 아직 완독하지 않은 행을 보내면 서버가 400(validation-error)을 돌려준다
 * (api/goal/workbooks.ts canShelveWorkbook 검증).
 */
export async function shelveGoalWorkbook(
  id: number,
): Promise<
  | Exclude<GoalWorkbooksRequestResult, { kind: "success" }>
  | { kind: "success"; workbook: GoalWorkbook }
> {
  const outcome = await goalWorkbooksRequest("PUT", { id, shelve: true });
  if (outcome.kind !== "success") return outcome;
  return { kind: "success", workbook: outcome.result?.workbook };
}

/** DELETE — 문제집 1건 삭제. deleteGoalPlanTask와 동일 규약(성공 시 kind만 반환). */
export async function deleteGoalWorkbook(
  id: number,
): Promise<
  Exclude<GoalWorkbooksRequestResult, { kind: "success" }> | { kind: "success" }
> {
  const outcome = await goalWorkbooksRequest("DELETE", { id });
  if (outcome.kind !== "success") return outcome;
  return { kind: "success" };
}

// GET /api/goal/student · POST /api/goal/intake · GET/POST/PUT/DELETE /api/goal/schedules
// 공용 클라이언트.
// ---------------------------------------------------------------------------
// 중요일정 — GET/POST/PUT/DELETE /api/goal/schedules
// ---------------------------------------------------------------------------
//
// fetchGoalSchedules 반환 계약(discriminated union):
//   { kind: 'no-session' }             — 401.
//   { kind: 'not-allowed' }            — 200 {allowed:false}. 이용권 없음.
//   { kind: 'success', schedules }     — 200 {ok:true, schedules}. schedules는
//                                         api/_lib/goalRepo.js buildSchedulePayload() 배열:
//                                         [{id,title,category,dueDate,memo}].
//   { kind: 'error' }                  — 그 외 전부(409 not_onboarded 포함, 판정 불가로
//                                         접는다 — /app/goal/schedules는 RequireGoalAccess가
//                                         이미 온보딩 완료를 보장해 정상 경로에선 안 나온다).
export type FetchGoalSchedulesResult =
  | { kind: "no-session" }
  | { kind: "not-allowed" }
  | { kind: "success"; schedules: GoalSchedule[] }
  | { kind: "error" };

export async function fetchGoalSchedules(): Promise<FetchGoalSchedulesResult> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { kind: "no-session" };

  let response: Response;
  try {
    response = await apiFetch("/api/goal/schedules", {
      method: "GET",
      headers: authHeader,
    });
  } catch (error) {
    console.error("[goalApi] GET /api/goal/schedules 호출 오류:", error);
    return { kind: "error" };
  }

  if (response.status === 401) return { kind: "no-session" };
  if (!response.ok) {
    console.error("[goalApi] GET /api/goal/schedules 실패:", response.status);
    return { kind: "error" };
  }

  const body = await parseJsonSafe(response);
  if (body?.allowed === false) return { kind: "not-allowed" };
  if (body?.ok === true)
    return { kind: "success", schedules: body.schedules || [] };

  console.error("[goalApi] GET /api/goal/schedules 예상 밖 응답 모양:", body);
  return { kind: "error" };
}

// create/update/delete 3종이 공유하는 요청·응답 판정. 반환 계약:
//   { kind: 'success', schedule? }       — 200. create/update만 schedule을 담는다.
//   { kind: 'no-session' }               — 401.
//   { kind: 'not-allowed' }              — 403(쓰기형이라 200 {allowed:false}가 아니다).
//   { kind: 'not-found' }                — 404(update/delete가 본인 소유 행을 못 찾음).
//   { kind: 'validation-error', detail } — 400.
//   { kind: 'error' }                    — 409(not_onboarded 등 방어적 분기) 포함 그 외 전부.
type SubmitGoalScheduleResult =
  | { kind: "success"; schedule?: GoalSchedule }
  | { kind: "no-session" }
  | { kind: "not-allowed" }
  | { kind: "not-found" }
  | { kind: "validation-error"; detail: string }
  | { kind: "error" };

async function submitGoalSchedule(
  method: string,
  body: object,
): Promise<SubmitGoalScheduleResult> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { kind: "no-session" };

  let response: Response;
  try {
    response = await apiFetch("/api/goal/schedules", {
      method,
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error(`[goalApi] ${method} /api/goal/schedules 호출 오류:`, error);
    return { kind: "error" };
  }

  const result = await parseJsonSafe(response);

  if (response.status === 200) {
    return { kind: "success", schedule: result?.schedule };
  }
  if (response.status === 401) return { kind: "no-session" };
  if (response.status === 403) return { kind: "not-allowed" };
  if (response.status === 404) return { kind: "not-found" };
  if (response.status === 400)
    return { kind: "validation-error", detail: result?.detail };

  console.error(
    `[goalApi] ${method} /api/goal/schedules 실패:`,
    response.status,
    result?.detail,
  );
  return { kind: "error" };
}

interface GoalScheduleInput {
  title: string;
  category: string;
  dueDate: string;
  memo?: string;
}

export async function createGoalSchedule({
  title,
  category,
  dueDate,
  memo,
}: GoalScheduleInput) {
  return submitGoalSchedule("POST", { title, category, dueDate, memo });
}

export async function updateGoalSchedule({
  id,
  title,
  category,
  dueDate,
  memo,
}: GoalScheduleInput & { id: number }) {
  return submitGoalSchedule("PUT", { id, title, category, dueDate, memo });
}

export async function deleteGoalSchedule({ id }: { id: number }) {
  return submitGoalSchedule("DELETE", { id });
}

// GET /api/goal/student · POST /api/goal/intake · /api/goal/plan-tasks(CRUD) 공용 클라이언트.
// ---------------------------------------------------------------------------
// 학습 계획 과제(goal_plan_tasks) — GET/POST/PUT/DELETE /api/goal/plan-tasks
// ---------------------------------------------------------------------------
//
// 네 함수 모두 fetchGoalStudent/submitGoalIntake와 같은 규약(예외를 던지지
// 않고 discriminated union으로 반환, `kind` 필드로 분기)을 따른다.
//
// task shape(camelCase, api/_lib/goalRepo.js buildPlanTaskPayload와 동일):
//   { id, planDate, title, subject, durationMinutes, done, sortOrder }
//   subject는 한글 라벨('국어'/'수학'/'영어'/'탐구'/'기타') — 서버가 DB 코드와
//   왕복 변환하므로 클라이언트는 항상 이 라벨만 다룬다(AddTaskModal 과목 칩과 동일).

type RequestPlanTasksResult =
  | { kind: "no-session" }
  | { kind: "not-allowed" }
  | { kind: "not-found" }
  | { kind: "validation-error"; detail: string }
  | { kind: "error" }
  // biome-ignore lint/suspicious/noExplicitAny: 안전 파싱된 원시 JSON 그대로 넘긴다 — 각 wrapper가 필요한 필드만 좁혀 쓴다.
  | { kind: "success"; body: any };

/** 공용 요청 실행기 — 인증 헤더 부착 + JSON 직렬화 + 안전 파싱까지 4개 함수가 공유. */
async function requestPlanTasks(
  method: string,
  { query, body }: { query?: Record<string, string>; body?: object } = {},
): Promise<RequestPlanTasksResult> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { kind: "no-session" };

  const qs = query ? `?${new URLSearchParams(query).toString()}` : "";

  let response: Response;
  try {
    response = await apiFetch(`/api/goal/plan-tasks${qs}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...authHeader,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    console.error(`[goalApi] ${method} /api/goal/plan-tasks 호출 오류:`, error);
    return { kind: "error" };
  }

  const result = await parseJsonSafe(response);

  if (response.status === 401) return { kind: "no-session" };
  if (response.status === 403) return { kind: "not-allowed" };
  if (response.status === 404) return { kind: "not-found" };
  if (response.status === 400)
    return { kind: "validation-error", detail: result?.detail };

  if (!response.ok) {
    console.error(
      `[goalApi] ${method} /api/goal/plan-tasks 실패:`,
      response.status,
      result?.detail,
    );
    return { kind: "error" };
  }

  return { kind: "success", body: result };
}

/**
 * 기간(from~to, YYYY-MM-DD, 양끝 포함) 과제 목록.
 *   { kind: 'success', tasks }  — 200 {ok:true, tasks:[...]}.
 *   { kind: 'not-allowed' }     — 200 {allowed:false}. 이용권 없음(조회형 규약).
 *   그 외 kind는 requestPlanTasks 공통 계약(no-session/validation-error/error).
 */
export async function fetchGoalPlanTasks({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const result = await requestPlanTasks("GET", { query: { from, to } });
  if (result.kind !== "success") return result;
  if (result.body?.allowed === false) return { kind: "not-allowed" as const };
  return {
    kind: "success" as const,
    tasks: (result.body?.tasks || []) as GoalPlanTask[],
  };
}

interface GoalPlanTaskInput {
  planDate: string;
  title: string;
  subject: string;
  durationMinutes: number;
  // 문제집 연결(QA 행286-B) — 셋 다 선택. workbookId만 보내면 페이지 없이 연결,
  // 셋 다 보내면 페이지 범위까지 연결(api/goal/plan-tasks.ts validateWorkbookLinkFields
  // 검증 규약과 동일). null은 연결 해제(updateGoalPlanTask 전용, 생성 시엔 안 씀).
  workbookId?: number | null;
  pageFrom?: number | null;
  pageTo?: number | null;
  // 여러 plan_date로 펼쳐지는 호출(schedule !== "오늘만")임을 서버에 알린다
  // (QA 행286-B 정정, 2026-09-02) — 문제집이 연결된 과제는 완전히 단일 날짜
  // 1건만 허용한다("이번 주만"의 7일 복제도 포함해서 막는다). 모달이 이미 이
  // 조합을 못 고르게(일정 select 자체를 비활성) 막지만, 서버도 같은 규칙을 한
  // 번 더 확인한다. true일 때만 보낸다 — 그 외 호출부는 이 필드를 몰라도 된다.
  repeatSchedule?: boolean;
}

/** 과제 1건 생성. 성공 시 { kind:'success', task }. */
export async function createGoalPlanTask({
  planDate,
  title,
  subject,
  durationMinutes,
  workbookId,
  pageFrom,
  pageTo,
  repeatSchedule,
}: GoalPlanTaskInput) {
  const result = await requestPlanTasks("POST", {
    body: {
      planDate,
      title,
      subject,
      durationMinutes,
      ...(workbookId !== undefined ? { workbookId } : {}),
      ...(pageFrom !== undefined ? { pageFrom } : {}),
      ...(pageTo !== undefined ? { pageTo } : {}),
      ...(repeatSchedule ? { repeatSchedule } : {}),
    },
  });
  if (result.kind !== "success") return result;
  return {
    kind: "success" as const,
    task: result.body?.task as GoalPlanTask,
  };
}

/**
 * 과제 1건 부분 수정(status 전환 포함). patch에 있는 필드만 반영된다.
 * status는 pending/done/fail 3종(QA 행305) — 서버가 done을 함께 파생 갱신한다.
 */
export async function updateGoalPlanTask(
  id: number,
  patch: Partial<GoalPlanTaskInput> & {
    status?: "pending" | "done" | "fail";
    sortOrder?: number;
  },
) {
  const result = await requestPlanTasks("PUT", { body: { id, ...patch } });
  if (result.kind !== "success") return result;
  return {
    kind: "success" as const,
    task: result.body?.task as GoalPlanTask,
  };
}

/** 과제 1건 삭제. */
export async function deleteGoalPlanTask(id: number) {
  const result = await requestPlanTasks("DELETE", { body: { id } });
  if (result.kind !== "success") return result;
  return { kind: "success" as const };
}

// ---------------------------------------------------------------------------
// fetchGoalRanking — GET /api/goal/ranking
// ---------------------------------------------------------------------------
//
// 반환 계약(discriminated union, `kind` 필드로 분기):
//
//   { kind: 'no-session' }              — 세션 없음 또는 401.
//   { kind: 'error' }                   — 판정 불가(네트워크·파싱·5xx 등).
//   { kind: 'not-allowed' }             — 200 {allowed:false}. 이용권 없음.
//   { kind: 'ok', date, top, me }       — 200 {ok:true, ...}. top은 서버가 이미
//                                          "홍O동" 형태로 마스킹한 배열, me는
//                                          본인이 오늘 기록을 제출했을 때만
//                                          {rank,name,hours}이고 그 외엔 null
//                                          (api/goal/ranking.js 참고).
interface GoalRankingEntry {
  rank: number;
  name: string;
  hours: number;
}

export type FetchGoalRankingResult =
  | { kind: "no-session" }
  | { kind: "error" }
  | { kind: "not-allowed" }
  | {
      kind: "ok";
      date: string;
      top: GoalRankingEntry[];
      me: GoalRankingEntry | null;
    };

export async function fetchGoalRanking(): Promise<FetchGoalRankingResult> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { kind: "no-session" };

  let response: Response;
  try {
    response = await apiFetch("/api/goal/ranking", {
      method: "GET",
      headers: authHeader,
    });
  } catch (error) {
    console.error("[goalApi] GET /api/goal/ranking 호출 오류:", error);
    return { kind: "error" };
  }

  if (response.status === 401) return { kind: "no-session" };

  if (!response.ok) {
    console.error("[goalApi] GET /api/goal/ranking 실패:", response.status);
    return { kind: "error" };
  }

  const body = await parseJsonSafe(response);

  if (body?.allowed === false) return { kind: "not-allowed" };

  if (body?.ok === true) {
    return {
      kind: "ok",
      date: body.date,
      top: body.top || [],
      me: body.me || null,
    };
  }

  console.error("[goalApi] GET /api/goal/ranking 예상 밖 응답 모양:", body);
  return { kind: "error" };
}

// ---------------------------------------------------------------------------
// fetchGoalGrades — GET /api/goal/grades
// addGoalGrade    — POST /api/goal/grades
// ---------------------------------------------------------------------------
//
// api/goal/grades.js 참고 — 성적 기록·표시 전용이다. 확률/그래프를 다시 계산하지
// 않으므로 이 두 함수의 반환값에도 확률·rate 필드가 없다.
//
// fetchGoalGrades 반환 계약(fetchGoalStudent 와 같은 kind 분기 관례):
//   { kind: 'no-session' | 'not-allowed' | 'not-onboarded' | 'error' }
//   { kind: 'ok', naesinRecords: [...], mockRecords: [...] }
//     — 각 레코드 shape: { term, enteredAt|examDate, subjects:{korean,math,english,science},
//       value, none:false, recordedAt } (api/goal/grades.js validateEntry 참고).
export type FetchGoalGradesResult =
  | { kind: "no-session" }
  | { kind: "not-allowed" }
  | { kind: "not-onboarded" }
  | { kind: "error" }
  | {
      kind: "ok";
      naesinRecords: GoalGradeRecord[];
      mockRecords: GoalGradeRecord[];
    };

export async function fetchGoalGrades(): Promise<FetchGoalGradesResult> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { kind: "no-session" };

  let response: Response;
  try {
    response = await apiFetch("/api/goal/grades", {
      method: "GET",
      headers: authHeader,
    });
  } catch (error) {
    console.error("[goalApi] GET /api/goal/grades 호출 오류:", error);
    return { kind: "error" };
  }

  if (response.status === 401) return { kind: "no-session" };
  if (!response.ok) {
    console.error("[goalApi] GET /api/goal/grades 실패:", response.status);
    return { kind: "error" };
  }

  const body = await parseJsonSafe(response);

  if (body?.allowed === false) return { kind: "not-allowed" };
  if (body?.onboarded === false) return { kind: "not-onboarded" };
  if (body?.onboarded === true) {
    return {
      kind: "ok",
      naesinRecords: body.naesinRecords || [],
      mockRecords: body.mockRecords || [],
    };
  }

  console.error("[goalApi] GET /api/goal/grades 예상 밖 응답 모양:", body);
  return { kind: "error" };
}

interface GoalGradeEntryInput {
  term: string;
  enteredAt?: string;
  examDate?: string;
  subjects: {
    korean: number | string;
    math: number | string;
    english: number | string;
    science: number | string;
  };
}

export type AddGoalGradeResult =
  | { kind: "no-session" }
  | { kind: "not-allowed" }
  | { kind: "not-onboarded" }
  | { kind: "validation-error"; detail: string }
  | { kind: "success"; record?: GoalGradeRecord; records: GoalGradeRecord[] }
  | { kind: "error" };

/**
 * 반환 계약:
 *   { kind: 'no-session' | 'not-allowed' | 'not-onboarded' | 'error' }
 *   { kind: 'validation-error', detail }  — 400.
 *   { kind: 'success', record, records }  — 200. records = 갱신된 전체 회차 배열
 *     (해당 type 전체를 그대로 교체해 쓸 수 있게, 서버가 upsertRecord 이후 값을 돌려준다).
 */
export async function addGoalGrade(
  type: "naesin" | "mock",
  entry: GoalGradeEntryInput,
): Promise<AddGoalGradeResult> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { kind: "no-session" };

  let response: Response;
  try {
    response = await apiFetch("/api/goal/grades", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ type, entry }),
    });
  } catch (error) {
    console.error("[goalApi] POST /api/goal/grades 호출 오류:", error);
    return { kind: "error" };
  }

  const result = await parseJsonSafe(response);

  if (response.status === 200) {
    return {
      kind: "success",
      record: result?.record,
      records: result?.records || [],
    };
  }
  if (response.status === 400)
    return { kind: "validation-error", detail: result?.detail };
  if (response.status === 401) return { kind: "no-session" };
  if (response.status === 403) return { kind: "not-allowed" };
  if (response.status === 404) return { kind: "not-onboarded" };

  console.error(
    "[goalApi] POST /api/goal/grades 실패:",
    response.status,
    result?.detail,
  );
  return { kind: "error" };
}

export type UpdateGoalGradeResult =
  | { kind: "no-session" }
  | { kind: "not-allowed" }
  | { kind: "not-onboarded" }
  | { kind: "not-found" }
  | { kind: "validation-error"; detail: string }
  | { kind: "success"; record?: GoalGradeRecord; records: GoalGradeRecord[] }
  | { kind: "error" };

/**
 * PUT /api/goal/grades — 회차 id(term) 기준 전체 갱신(api/goal/grades.ts handlePut 참고).
 *
 * 반환 계약:
 *   { kind: 'no-session' | 'not-allowed' | 'error' }
 *   { kind: 'not-onboarded' | 'not-found' }             — 404. not-found는 originalTerm이
 *     가리키는 회차 자체가 없는 경우(reason:'record_not_found'), not-onboarded는 온보딩
 *     행 자체가 없는 경우(reason:'not_onboarded') — 서버가 detail만 주고 reason 필드는
 *     디버깅용이라 이 래퍼는 구분하지 않고 404 전체를 not-found로 접지 않는다: 두 reason이
 *     서로 다른 사용자 안내가 필요할 수 있어(addGoalGrade의 not-onboarded와 동일 관례로
 *     맞춘다) 분리해 둔다.
 *   { kind: 'validation-error', detail }                — 400(입력 검증 실패 또는 이름 충돌).
 *   { kind: 'success', record, records }                — 200. records = 갱신된 전체 배열.
 */
export async function updateGoalGrade(
  type: "naesin" | "mock",
  originalTerm: string,
  entry: GoalGradeEntryInput,
): Promise<UpdateGoalGradeResult> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { kind: "no-session" };

  let response: Response;
  try {
    response = await apiFetch("/api/goal/grades", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ type, term: originalTerm, entry }),
    });
  } catch (error) {
    console.error("[goalApi] PUT /api/goal/grades 호출 오류:", error);
    return { kind: "error" };
  }

  const result = await parseJsonSafe(response);

  if (response.status === 200) {
    return {
      kind: "success",
      record: result?.record,
      records: result?.records || [],
    };
  }
  if (response.status === 400)
    return { kind: "validation-error", detail: result?.detail };
  if (response.status === 401) return { kind: "no-session" };
  if (response.status === 403) return { kind: "not-allowed" };
  if (response.status === 404) {
    return result?.reason === "record_not_found"
      ? { kind: "not-found" }
      : { kind: "not-onboarded" };
  }

  console.error(
    "[goalApi] PUT /api/goal/grades 실패:",
    response.status,
    result?.detail,
  );
  return { kind: "error" };
}

export type DeleteGoalGradeResult =
  | { kind: "no-session" }
  | { kind: "not-allowed" }
  | { kind: "not-onboarded" }
  | { kind: "not-found" }
  | { kind: "success"; records: GoalGradeRecord[] }
  | { kind: "error" };

/**
 * DELETE /api/goal/grades — 회차 id(term) 기준 삭제(api/goal/grades.ts handleDelete 참고).
 * kind 분기는 updateGoalGrade와 동일 관례(validation-error만 없음 — 삭제는 term 누락 외
 * 별도 바디 검증이 없다).
 */
export async function deleteGoalGrade(
  type: "naesin" | "mock",
  term: string,
): Promise<DeleteGoalGradeResult> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { kind: "no-session" };

  let response: Response;
  try {
    response = await apiFetch("/api/goal/grades", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ type, term }),
    });
  } catch (error) {
    console.error("[goalApi] DELETE /api/goal/grades 호출 오류:", error);
    return { kind: "error" };
  }

  const result = await parseJsonSafe(response);

  if (response.status === 200) {
    return { kind: "success", records: result?.records || [] };
  }
  if (response.status === 401) return { kind: "no-session" };
  if (response.status === 403) return { kind: "not-allowed" };
  if (response.status === 404) {
    return result?.reason === "record_not_found"
      ? { kind: "not-found" }
      : { kind: "not-onboarded" };
  }

  console.error(
    "[goalApi] DELETE /api/goal/grades 실패:",
    response.status,
    result?.detail,
  );
  return { kind: "error" };
}

// GET /api/goal/student · POST /api/goal/intake · GET/POST /api/goal/timer 공용 클라이언트.
// ---------------------------------------------------------------------------
// 열공 타이머(#25) — GET/POST /api/goal/timer
// ---------------------------------------------------------------------------
//
// 다섯 함수 모두 fetchGoalStudent/submitGoalIntake와 같은 규약(예외를 던지지
// 않고 discriminated union으로 반환, `kind` 필드로 분기)을 따른다.
//
// summary shape(camelCase, api/goal/timer.js GET 응답 그대로):
//   { date, serverNow, running:{subject,startedAt}|null,
//     subjects:[{subject,seconds}], totalSeconds,
//     targets:[{subject,targetHours}], visibleSubjects:[subject] }
// subject 값은 코드(8종 — korean/math/english/science/social/history/
// second_lang/etc, QA B9로 5종에서 확장) — 한글 라벨 변환은
// src/components/goal/subjectTokens.js가 담당한다(plan-tasks의 한글 왕복
// 변환과 달리, 타이머는 코드값을 그대로 화면까지 들고 간다).
// visibleSubjects는 학생이 타이머 화면에 실제로 노출 중인 과목(기본 4과목 +
// "+ 과목 추가"로 늘린 과목)만 담는다 — subjects/targets는 카탈로그 전체를
// 담을 수 있으므로 카드 렌더링은 반드시 visibleSubjects를 기준으로 한다.
//
// ⚠ pagehide 하트비트는 navigator.sendBeacon이 아니라 fetch(..., {keepalive:true})를
// 쓴다(judgement call) — sendBeacon은 커스텀 헤더를 지원하지 않아 이 저장소의
// Bearer 토큰 인증(getBearerToken, Authorization 헤더 전용)과 양립할 수 없다.
// keepalive:true는 sendBeacon과 동일하게 페이지 언로드 이후에도 요청이 살아남는
// 것을 브라우저가 보장하는 표준 대안이다.

type RequestGoalTimerResult =
  | { kind: "no-session" }
  | { kind: "not-allowed" }
  | { kind: "validation-error"; detail: string }
  | { kind: "error" }
  // biome-ignore lint/suspicious/noExplicitAny: 안전 파싱된 원시 JSON 그대로 넘긴다 — 각 wrapper가 필요한 필드만 좁혀 쓴다.
  | { kind: "success"; body: any };

/** 공용 요청 실행기 — 인증 헤더 부착 + JSON 직렬화 + 안전 파싱까지 공유. */
async function requestGoalTimer(
  method: string,
  body?: object,
  { keepalive = false }: { keepalive?: boolean } = {},
): Promise<RequestGoalTimerResult> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { kind: "no-session" };

  let response: Response;
  try {
    response = await apiFetch("/api/goal/timer", {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...authHeader,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      ...(keepalive ? { keepalive: true } : {}),
    });
  } catch (error) {
    console.error(`[goalApi] ${method} /api/goal/timer 호출 오류:`, error);
    return { kind: "error" };
  }

  const result = await parseJsonSafe(response);

  if (response.status === 401) return { kind: "no-session" };
  if (response.status === 403) return { kind: "not-allowed" };
  if (response.status === 400)
    return { kind: "validation-error", detail: result?.detail };

  if (!response.ok) {
    console.error(
      `[goalApi] ${method} /api/goal/timer 실패:`,
      response.status,
      result?.detail,
    );
    return { kind: "error" };
  }

  return { kind: "success", body: result };
}

/**
 * 오늘(KST) 타이머 요약 조회.
 *   { kind: 'success', summary }  — 200. summary는 위 shape 그대로.
 *   { kind: 'not-allowed' }       — 200 {allowed:false}. 이용권 없음(조회형 규약).
 *   그 외 kind는 requestGoalTimer 공통 계약(no-session/error).
 */
export async function fetchGoalTimer() {
  const result = await requestGoalTimer("GET");
  if (result.kind !== "success") return result;
  if (result.body?.allowed === false) return { kind: "not-allowed" as const };
  return {
    kind: "success" as const,
    summary: result.body as GoalTimerSummary,
  };
}

/** 과목 측정 시작 — 진행 중이던 다른 과목이 있으면 서버가 자동으로 전환 마감한다. */
export async function startGoalTimer(subject: string) {
  const result = await requestGoalTimer("POST", { action: "start", subject });
  if (result.kind !== "success") return result;
  return {
    kind: "success" as const,
    running: result.body?.running as GoalTimerSummary["running"],
  };
}

/** 진행 중인 세션 종료. 진행 중이 없어도 200(멱등) — 항상 success로 접는다. */
export async function stopGoalTimer({
  keepalive = false,
}: {
  keepalive?: boolean;
} = {}) {
  const result = await requestGoalTimer(
    "POST",
    { action: "stop" },
    { keepalive },
  );
  if (result.kind !== "success") return result;
  return { kind: "success" as const };
}

/** 하트비트 touch. pagehide에서 호출할 땐 keepalive:true를 넘긴다(위 주석 참고). */
export async function heartbeatGoalTimer({
  keepalive = false,
}: {
  keepalive?: boolean;
} = {}) {
  const result = await requestGoalTimer(
    "POST",
    { action: "heartbeat" },
    { keepalive },
  );
  if (result.kind !== "success") return result;
  return {
    kind: "success" as const,
    running: result.body?.running as GoalTimerSummary["running"],
  };
}

/** 과목별 목표 시간 저장(학생 자율 설정). */
export async function setGoalTimerTarget(subject: string, targetHours: number) {
  const result = await requestGoalTimer("POST", {
    action: "setTarget",
    subject,
    targetHours,
  });
  if (result.kind !== "success") return result;
  return {
    kind: "success" as const,
    target: result.body?.target as GoalTimerSummary["targets"][number],
  };
}

/** 타이머 화면에 과목 카드 추가("+ 과목 추가", QA B9). 이미 노출 중이면 멱등. */
export async function addGoalTimerSubject(subject: string) {
  const result = await requestGoalTimer("POST", {
    action: "addSubject",
    subject,
  });
  if (result.kind !== "success") return result;
  return {
    kind: "success" as const,
    visibleSubjects: result.body
      ?.visibleSubjects as GoalTimerSummary["visibleSubjects"],
  };
}

// ---------------------------------------------------------------------------
// fetchGoalReport — GET /api/goal/report
// ---------------------------------------------------------------------------
//
// 반환 계약(discriminated union, `kind` 필드로 분기) — fetchGoalStudent()와 같은 판별자
// 이름을 재사용하되, 이 엔드포인트는 항상 GET(조회형)이라 'not-allowed'까지만 필요하고
// 'validation-error'/'cuts-missing' 같은 쓰기 전용 분기는 없다.
//
//   { kind: 'no-session' }        — 401.
//   { kind: 'not-allowed' }       — 200 {allowed:false}. 이용권 없음.
//   { kind: 'not-onboarded' }     — 409 reason:'not_onboarded'. 온보딩 자체를 시작 안 함.
//   { kind: 'awaiting-cuts' }     — 409 reason:'awaiting_cuts'. 컷 대기 중이라 rate/target 미확정.
//   { kind: 'not-linked' }        — 403 {error:{code:'NOT_LINKED'}}. studentId로 학부모가
//     조회할 때만 나온다 — 서버가 fn_is_linked_pair로 재확인한 결과 승인된 쌍이 아니다
//     (api/goal/report.ts checkLinkedPair, QA 시트 행210).
//   { kind: 'success', report }   — 200 {ok:true, report}. report는 type별로 모양이 다르다
//     (GrowthReportBody.jsx / DirectionReportBody.jsx가 그대로 소비하는 shape — api/goal/report.js
//     buildGrowthReport()/buildDirectionReport() 참고). 이 파일은 discriminated union 판별자만
//     책임지므로 report 본문은 호출부(각 리포트 페이지)가 자신의 로컬 타입으로 좁혀 쓴다.
export type FetchGoalReportResult =
  | { kind: "no-session" }
  | { kind: "not-allowed" }
  | { kind: "not-onboarded" }
  | { kind: "awaiting-cuts" }
  | { kind: "not-linked" }
  // biome-ignore lint/suspicious/noExplicitAny: report는 type(weekly/monthly/direction)별로 모양이 다르다 — 호출부가 자신의 로컬 타입으로 좁혀 쓴다.
  | { kind: "success"; report: any }
  | { kind: "error" };

// 세 번째 인자 `periodOrReportId` — weekly/monthly는 기간(period=YYYY-MM-DD|YYYY-MM),
// direction은 저장된 리포트 id(reportId, QA 행301)다. 같은 슬롯을 재사용하되 쿼리 키만
// type으로 분기한다 — 두 값이 같은 화면에 동시에 필요한 호출부가 없어 별도 인자를
// 추가하지 않았다(호출부 4곳: GrowthReport.tsx weekly/monthly, DirectionReport.tsx direction,
// ChildReport.tsx weekly/monthly — 마지막 인자 `studentId`만 넘긴다).
//
// 네 번째 인자 `studentId` — 학부모가 자녀 리포트를 열람할 때만 넘긴다(QA 시트 행210,
// api/goal/report.ts studentId 쿼리). weekly/monthly 전용이다 — direction과 함께 보내면
// 서버가 400을 준다(호출부에서 애초에 조합하지 않는다). 생략하면 기존 동작 그대로
// (요청자 본인 리포트).
export async function fetchGoalReport(
  type: "weekly" | "monthly" | "direction",
  periodOrReportId?: string,
  track?: "naesin" | "jeongsi",
  studentId?: string,
): Promise<FetchGoalReportResult> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { kind: "no-session" };

  const params = new URLSearchParams({ type });
  if (periodOrReportId) {
    params.set(type === "direction" ? "reportId" : "period", periodOrReportId);
  }
  if (type === "direction" && track) params.set("track", track);
  if (studentId) params.set("studentId", studentId);

  let response: Response;
  try {
    response = await apiFetch(`/api/goal/report?${params.toString()}`, {
      method: "GET",
      headers: authHeader,
    });
  } catch (error) {
    console.error("[goalApi] GET /api/goal/report 호출 오류:", error);
    return { kind: "error" };
  }

  if (response.status === 401) return { kind: "no-session" };

  const body = await parseJsonSafe(response);

  if (response.status === 200) {
    if (body?.allowed === false) return { kind: "not-allowed" };
    if (body?.ok === true) return { kind: "success", report: body.report };
    console.error(
      "[goalApi] GET /api/goal/report 예상 밖 200 응답 모양:",
      body,
    );
    return { kind: "error" };
  }

  if (response.status === 409) {
    return {
      kind:
        body?.reason === "awaiting_cuts" ? "awaiting-cuts" : "not-onboarded",
    };
  }

  // coded shape(api/_lib/httpResponse.ts) — studentId로 조회했는데 서버 재확인 결과
  // 승인된 학부모-학생 쌍이 아닌 경우만 이 코드가 온다(api/goal/report.ts checkLinkedPair).
  if (response.status === 403 && body?.error?.code === "NOT_LINKED") {
    return { kind: "not-linked" };
  }

  console.error(
    "[goalApi] GET /api/goal/report 실패:",
    response.status,
    body?.detail,
  );
  return { kind: "error" };
}

// ---------------------------------------------------------------------------
// GET/POST /api/goal/advice — QA 행295·306 AI 입시조언(intake) / 오늘의 조언·
// 내일 계획(daily). 응답 shape은 api/_lib/goalAdvice.ts AdvicePayload와 같다.
// ---------------------------------------------------------------------------

export interface GoalAdviceSection {
  label: string;
  body: string;
}

export interface GoalMajorTip {
  department: string;
  text: string;
}

export interface GoalAdvicePayload {
  source: "intake" | "daily";
  origin: "ai" | "rule";
  probabilitySummary: string;
  sections: GoalAdviceSection[];
  majorTips: GoalMajorTip[];
}

export type FetchGoalAdviceResult =
  | { kind: "no-session" }
  | { kind: "not-allowed" }
  | { kind: "not-active" }
  | {
      kind: "success";
      intake: GoalAdvicePayload | null;
      daily: GoalAdvicePayload | null;
    }
  | { kind: "error" };

/** GET /api/goal/advice — 오늘자 캐시(두 소스) 조회. 생성은 하지 않는다(POST 전용). */
export async function fetchGoalAdvice(): Promise<FetchGoalAdviceResult> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { kind: "no-session" };

  let response: Response;
  try {
    response = await apiFetch("/api/goal/advice", {
      method: "GET",
      headers: authHeader,
    });
  } catch (error) {
    console.error("[goalApi] GET /api/goal/advice 호출 오류:", error);
    return { kind: "error" };
  }

  if (response.status === 401) return { kind: "no-session" };
  if (response.status === 409) return { kind: "not-active" };

  if (!response.ok) {
    console.error("[goalApi] GET /api/goal/advice 실패:", response.status);
    return { kind: "error" };
  }

  const body = await parseJsonSafe(response);

  if (body?.allowed === false) return { kind: "not-allowed" };

  if (body?.ok === true) {
    return {
      kind: "success",
      intake: body.intake ?? null,
      daily: body.daily ?? null,
    };
  }

  console.error("[goalApi] GET /api/goal/advice 예상 밖 응답 모양:", body);
  return { kind: "error" };
}

export type GenerateGoalAdviceResult =
  | { kind: "no-session" }
  | { kind: "not-allowed" }
  | { kind: "not-active" }
  | { kind: "validation-error"; detail: string }
  | { kind: "success"; advice: GoalAdvicePayload }
  | { kind: "error" };

/**
 * POST /api/goal/advice — 온보딩 완료(source:'intake')·기록 저장(source:'daily') 직후
 * fire-and-forget으로 호출한다. 오늘 이미 생성됐으면 서버가 캐시를 그대로 돌려준다
 * (재호출해도 Gemini가 다시 불리지 않는다).
 */
export async function generateGoalAdvice(
  source: "intake" | "daily",
): Promise<GenerateGoalAdviceResult> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { kind: "no-session" };

  let response: Response;
  try {
    response = await apiFetch("/api/goal/advice", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ source }),
    });
  } catch (error) {
    console.error("[goalApi] POST /api/goal/advice 호출 오류:", error);
    return { kind: "error" };
  }

  const result = await parseJsonSafe(response);

  if (response.status === 200 && result?.ok === true) {
    const { ok, ...advice } = result;
    return { kind: "success", advice: advice as GoalAdvicePayload };
  }

  if (response.status === 401) return { kind: "no-session" };
  if (response.status === 403) return { kind: "not-allowed" };
  if (response.status === 409) return { kind: "not-active" };
  if (response.status === 400) {
    return { kind: "validation-error", detail: result?.detail };
  }

  console.error(
    "[goalApi] POST /api/goal/advice 실패:",
    response.status,
    result?.detail,
  );
  return { kind: "error" };
}
