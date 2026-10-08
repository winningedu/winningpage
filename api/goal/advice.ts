// GET/POST /api/goal/advice — QA 행295·306.
// Authorization: Bearer <access_token>
//
// 두 트리거를 하나의 엔드포인트가 `source`로 구분한다(설계 §6):
//   POST { source: 'intake' }  — 온보딩 완료 직후 1회(Onboarding.tsx handleFinish 성공 후).
//   POST { source: 'daily'  }  — "오늘의 공부 기록" 저장 성공 직후(DailyRecord.tsx).
//   GET                        — 대시보드 로드 시 오늘자 캐시(두 소스) 조회, 없으면 null.
//
// 캐시(goal_advice_cache, profile_id×source×generated_for(KST 날짜) UNIQUE)가 곧
// 레이트리밋이다 — 같은 날 재요청은 Gemini를 다시 부르지 않고 저장된 payload를
// 그대로 돌려준다. Gemini 실패/GEMINI_API_KEY 미설정이면 규칙 기반 폴백(origin:'rule')을
// 같은 shape으로 만들어 캐시에 저장한다(문자열 상수 폴백 금지, [[no-fallback-constants]]).
//
// 프롬프트, 후처리, 규칙 폴백은 순수 함수(api/_lib/goal/advice.ts)에 전부 위임한다.
// 이 파일은 세션 게이트, DB 조회, Gemini 호출 배선만 한다(api/_lib/goal/repo.ts 파일 헌장과
// 동일 원칙, daily-record.ts 컨벤션 재사용).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  addDaysYMD,
  getDayIndexFromYMDServer,
  kstYMD,
  VIRTUAL_DAY_NAMES,
} from "../../src/lib/goal/calc/index.js";
import {
  buildNaesinSubjectMetrics,
  round1,
  toNum,
} from "../../src/lib/goal/report/aggregate.js";
import { buildDirectionSummary } from "../../src/lib/goal/report/insights.js";
import { WEEKDAY_LABELS } from "../../src/lib/goalPlanUtils.js";
import { callText } from "../_lib/gemini.js";
import {
  ADVICE_RESPONSE_SCHEMA,
  type AdviceModelResult,
  type AdvicePromptInput,
  buildAdvicePayload,
  buildAdvicePrompt,
  buildRuleFallback,
  pickAdviceTheme,
  pickMajorTheme,
  pickPlanMode,
} from "../_lib/goal/advice.js";
import {
  DEFAULT_TIMER_SUBJECTS,
  fetchAdviceCache,
  fetchRecordsInRange,
  fetchStudentRow,
  fetchStudentStateRow,
  fetchSubjectTargets,
  fetchTodayRecord,
  narrowGoalSession,
  num,
  openGoalSession,
  PAID_MESSAGE,
  SUBJECT_CODE_TO_LABEL,
  upsertAdviceCache,
} from "../_lib/goal/repo.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

type GoalSession = Awaited<ReturnType<typeof openGoalSession>>;

const ADVICE_TIMEOUT_MS = 30_000;
const ADVICE_TEMPERATURE = 0.35;
const ADVICE_MAX_OUTPUT_TOKENS = 500;
const RECENT_DAYS_WINDOW = 3;

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

// ---------------------------------------------------------------------------
// 학생 상태 게이트 — daily-record.ts requireActiveStudent와 동일 판정(각 라우트가
// 로컬 사본을 두는 기존 컨벤션, api/goal/daily-record.ts:192-215 참고).
// ---------------------------------------------------------------------------
async function requireActiveStudent(
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

// ---------------------------------------------------------------------------
// 학생유형(있으면) — src/lib/goal/report/insights.ts buildDirectionSummary +
// aggregate.ts buildNaesinSubjectMetrics 재사용(api/goal/report.ts와 동일 조합).
// 301(학습방향 리포트 영속화)은 별도 UoW라 여기서는 즉석 계산 best-effort로만
// 곁들인다 — 실패해도 조언 생성 자체를 막지 않는다(선택적 컨텍스트).
// ---------------------------------------------------------------------------
function buildStudentTypeContext(
  studentRow: Record<string, unknown>,
): { title: string; summary: string; weakSubjects: string } | null {
  try {
    const convertedGrade = toNum(studentRow.converted_grade, null);
    if (convertedGrade === null) return null;

    const entry = { value: convertedGrade } as {
      value: number;
      subjects?: Record<string, unknown>;
    };
    // biome-ignore lint/suspicious/noExplicitAny: buildNaesinSubjectMetrics는 GoalStudentRow(생성 타입 없음)를 받는다 — api/goal/report.ts와 동일하게 any로 넘긴다.
    const subjectsRaw = buildNaesinSubjectMetrics(studentRow as any, entry);
    if (!subjectsRaw.length) return null;

    const avgValue = round1(
      subjectsRaw.reduce((sum, s) => sum + s.grade, 0) / subjectsRaw.length,
    );
    const summary = buildDirectionSummary({
      track: "naesin",
      subjects: subjectsRaw,
      avgValue,
      idealCut: toNum(studentRow.ideal_naesin_cut, null),
      minCut: toNum(studentRow.min_naesin_cut, null),
    });

    const weakSubjects = [...subjectsRaw]
      .sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0))
      .slice(0, 2)
      .map((s) => `${s.name} ${round1(s.grade).toFixed(1)}등급`)
      .join(", ");

    return { title: summary.typeLabel, summary: summary.body, weakSubjects };
  } catch (error) {
    console.warn("goal/advice buildStudentTypeContext 실패(무시):", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 내일 계획 과목 배분 — Dashboard.tsx buildSubjectRatios/buildTomorrowPlan의 서버판.
// unit(단원)은 산출 근거가 없어 만들지 않는다(동일 사유).
// ---------------------------------------------------------------------------
export function buildTomorrowPlanItems(
  idealHours: number,
  timerTargets: { subject: unknown; targetHours: number | null }[],
): { subject: string; duration: string }[] {
  if (idealHours <= 0) return [];

  const relevant = timerTargets.filter(
    (t) =>
      DEFAULT_TIMER_SUBJECTS.includes(t.subject as string) &&
      (t.targetHours ?? 0) > 0,
  );
  const total = relevant.reduce((sum, t) => sum + (t.targetHours ?? 0), 0);

  const ratios: Record<string, number> =
    total <= 0
      ? Object.fromEntries(
          DEFAULT_TIMER_SUBJECTS.map((s) => [
            s,
            1 / DEFAULT_TIMER_SUBJECTS.length,
          ]),
        )
      : Object.fromEntries(
          DEFAULT_TIMER_SUBJECTS.map((s) => {
            const match = relevant.find((t) => t.subject === s);
            return [s, match ? (match.targetHours ?? 0) / total : 0];
          }),
        );

  const formatHours = (hours: number) => {
    const totalMinutes = Math.max(0, Math.round(hours * 60));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h <= 0) return `${m}분`;
    if (m <= 0) return `${h}시간`;
    return `${h}시간 ${m}분`;
  };

  return DEFAULT_TIMER_SUBJECTS.map((subjectId) => ({
    subject: SUBJECT_CODE_TO_LABEL[subjectId] || subjectId,
    hours: idealHours * (ratios[subjectId] ?? 0),
  }))
    .filter((item) => item.hours > 0)
    .map((item) => ({
      subject: item.subject,
      duration: formatHours(item.hours),
    }));
}

/** 최근 N일(오늘 제외) 기록 요약 — 표현 반복 방지용 참고 데이터(원본 recentUsedText 대응). */
export function buildRecentUsedText(
  records: { record_date: string; study_hours: unknown; tasks: unknown }[],
  todayYmd: string,
): string {
  const lines = records
    .filter((r) => r.record_date !== todayYmd)
    .map((r) => {
      const hours = num(r.study_hours) ?? 0;
      const tasks = Array.isArray(r.tasks) ? r.tasks.join("/") : "";
      return `${r.record_date} 순공 ${hours}시간${tasks ? ` (${tasks})` : ""}`;
    });
  return lines.join(", ").slice(0, 500);
}

/** POST body.source 검증 — 400 분기 판정을 순수 함수로 분리해 테스트 가능하게 한다. */
export function isValidAdviceSource(
  value: unknown,
): value is "intake" | "daily" {
  return value === "intake" || value === "daily";
}

/**
 * getDayIndexFromYMDServer 결과(0~6, 월~일) → 한글 요일 라벨. WEEKDAY_LABELS
 * (src/lib/goalPlanUtils.js)는 VIRTUAL_DAY_NAMES와 같은 월~일 순서다 — VIRTUAL_DAY_NAMES
 * 값(monday 등 영문 키)을 그대로 이어붙이면 "thursday요일" 같은 오타가 난다(2026-09-02
 * 로컬 E2E 발견, 팀장 지시로 수정). 범위 밖 인덱스는 방어적으로 "내일"을 쓴다.
 */
export function resolveDayNameKr(dayIndex: number): string {
  return WEEKDAY_LABELS[dayIndex] || "내일";
}

// ---------------------------------------------------------------------------
// 프롬프트 입력 조립, DB 행을 AdvicePromptInput 으로(api/_lib/goal/advice.ts 계약).
// ---------------------------------------------------------------------------
async function buildPromptInput(
  supabaseAdmin: NonNullable<GoalSession["supabaseAdmin"]>,
  profileId: string,
  source: "intake" | "daily",
  // biome-ignore lint/suspicious/noExplicitAny: api/_lib/goal/repo.ts Row(생성 타입 없음)와 동일 근거.
  studentRow: any,
  submitCount: number,
  now: Date,
): Promise<AdvicePromptInput> {
  const todayYmd = kstYMD(now);
  const jungsiAvailable =
    toNum(studentRow.ideal_jungsi_cut, null) !== null &&
    toNum(studentRow.min_jungsi_cut, null) !== null;

  const stateRow = await fetchStudentStateRow(supabaseAdmin, profileId);
  const student = {
    schoolType: studentRow.school_type || "",
    grade: studentRow.grade || "",
    currentScore: toNum(studentRow.current_score, null),
    currentMogo: toNum(studentRow.current_mogo, null),
    convertedGrade: toNum(studentRow.converted_grade, null),
    idealName: studentRow.ideal_university
      ? `${studentRow.ideal_university} ${studentRow.ideal_department || ""}`.trim()
      : "",
    minName: studentRow.min_university
      ? `${studentRow.min_university} ${studentRow.min_department || ""}`.trim()
      : "",
    idealSusi: toNum(stateRow?.ideal_susi, null),
    idealJungsi: toNum(stateRow?.ideal_jungsi, null),
    minSusi: toNum(stateRow?.min_susi, null),
    minJungsi: toNum(stateRow?.min_jungsi, null),
    jungsiAvailable,
    studentType: buildStudentTypeContext(studentRow),
  };

  // 내일(KST) 요일·목표 시간·과목 배분.
  const tomorrowYmd = addDaysYMD(todayYmd, 1, now);
  const tomorrowDayIndex = getDayIndexFromYMDServer(tomorrowYmd, now);
  // biome-ignore lint/style/noNonNullAssertion: getDayIndexFromYMDServer는 항상 0-6을 돌려줌(7개 배열).
  const tomorrowDayName = VIRTUAL_DAY_NAMES[tomorrowDayIndex]!;
  const tomorrowSchedule = studentRow.study_schedule?.[tomorrowDayName] || {
    ideal: 0,
    min: 0,
  };
  const subjectTargets = await fetchSubjectTargets(supabaseAdmin, profileId);
  const tomorrow = {
    dayNameKr: resolveDayNameKr(tomorrowDayIndex),
    idealHours: num(tomorrowSchedule.ideal) ?? 0,
    minHours: num(tomorrowSchedule.min) ?? 0,
    planItems: buildTomorrowPlanItems(
      num(tomorrowSchedule.ideal) ?? 0,
      subjectTargets,
    ),
  };

  // 최근 N일(오늘 제외) 요약.
  const rangeFrom = addDaysYMD(todayYmd, -RECENT_DAYS_WINDOW, now);
  const recentRecords = await fetchRecordsInRange(
    supabaseAdmin,
    profileId,
    rangeFrom,
    todayYmd,
  );
  const recentUsedText = buildRecentUsedText(recentRecords, todayYmd);

  let today: AdvicePromptInput["today"] = null;
  if (source === "daily") {
    const todayRecord = await fetchTodayRecord(
      supabaseAdmin,
      profileId,
      todayYmd,
    );
    const todayDayIndex = getDayIndexFromYMDServer(todayYmd, now);
    // biome-ignore lint/style/noNonNullAssertion: 위와 동일 근거.
    const todayDayName = VIRTUAL_DAY_NAMES[todayDayIndex]!;
    const todaySchedule = studentRow.study_schedule?.[todayDayName] || {
      ideal: 0,
      min: 0,
    };
    const idealHours = num(todaySchedule.ideal) ?? 0;
    const studyHours = num(todayRecord?.study_hours) ?? 0;

    today = {
      studyHours,
      achievementRate:
        idealHours > 0 ? Math.round((studyHours / idealHours) * 100) : null,
      // daily-record.ts POST가 이미 코드값→한글 라벨로 매핑해 저장한다
      // (TASK_LABELS/REASON_LABELS/CONDITION_LABELS, api/goal/daily-record.ts:63-101) —
      // 여기서 다시 매핑하지 않고 저장된 라벨 그대로 쓴다.
      condition: todayRecord?.body_condition || "",
      tasks: Array.isArray(todayRecord?.tasks) ? todayRecord.tasks : [],
      reasons: Array.isArray(todayRecord?.reasons) ? todayRecord.reasons : [],
      memo: todayRecord?.memo || "",
    };
  }

  return {
    source,
    student,
    today,
    tomorrow,
    recentUsedText,
    adviceTheme: pickAdviceTheme(submitCount),
    planMode: pickPlanMode(submitCount),
    majorTheme: pickMajorTheme(),
  };
}

// ---------------------------------------------------------------------------
// Gemini 호출 — 구조화 출력(responseSchema). 실패는 호출부가 규칙 폴백으로 흡수한다.
// ---------------------------------------------------------------------------
async function generateAdviceModelResult(
  prompt: string,
): Promise<AdviceModelResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ADVICE_TIMEOUT_MS);

  try {
    const raw = await callText("", prompt, {
      temperature: ADVICE_TEMPERATURE,
      maxOutputTokens: ADVICE_MAX_OUTPUT_TOKENS,
      responseMimeType: "application/json",
      responseSchema: ADVICE_RESPONSE_SCHEMA,
      abortSignal: controller.signal,
    });

    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.todayAdvice !== "string" ||
      typeof parsed?.tomorrowPlan !== "string" ||
      !Array.isArray(parsed?.majorTips)
    ) {
      throw new Error("Gemini 응답이 예상 shape과 다릅니다.");
    }

    return {
      todayAdvice: parsed.todayAdvice,
      tomorrowPlan: parsed.tomorrowPlan,
      majorTips: parsed.majorTips
        .filter(
          (tip: unknown): tip is { department: string; text: string } =>
            Boolean(tip) &&
            typeof (tip as { department?: unknown }).department === "string" &&
            typeof (tip as { text?: unknown }).text === "string",
        )
        .slice(0, 2),
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// GET — 오늘자 캐시(두 소스) 조회. 없으면 null(생성은 POST 전용).
// ---------------------------------------------------------------------------
async function handleGet(
  _req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;
  if (!allowed) {
    return res.status(200).json({ allowed: false });
  }

  const { supabaseAdmin, profileId } = narrowGoalSession(session);
  const gate = await requireActiveStudent(supabaseAdmin, profileId);
  if (gate.error) {
    return res.status(gate.error.status).json(gate.error.body);
  }

  const todayYmd = kstYMD(new Date());
  const [intakeRow, dailyRow] = await Promise.all([
    fetchAdviceCache(supabaseAdmin, profileId, "intake", todayYmd),
    fetchAdviceCache(supabaseAdmin, profileId, "daily", todayYmd),
  ]);

  return res.status(200).json({
    ok: true,
    intake: intakeRow?.payload ?? null,
    daily: dailyRow?.payload ?? null,
  });
}

// ---------------------------------------------------------------------------
// POST — 생성(캐시 미스 시)/캐시 반환. body: { source: 'intake'|'daily' }
// ---------------------------------------------------------------------------
async function handlePost(
  req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;
  if (!allowed) {
    return res.status(403).json({ detail: PAID_MESSAGE });
  }

  const { supabaseAdmin, profileId } = narrowGoalSession(session);
  const gate = await requireActiveStudent(supabaseAdmin, profileId);
  if (gate.error) {
    return res.status(gate.error.status).json(gate.error.body);
  }

  const body = readBody(req);
  const rawSource = body?.source;
  if (!isValidAdviceSource(rawSource)) {
    return res
      .status(400)
      .json({ detail: "source는 intake 또는 daily여야 합니다." });
  }
  const source = rawSource;

  const now = new Date();
  const todayYmd = kstYMD(now);

  // 캐시 히트 — 오늘 이미 생성됐으면 Gemini를 다시 부르지 않는다.
  const cached = await fetchAdviceCache(
    supabaseAdmin,
    profileId,
    source,
    todayYmd,
  );
  if (cached) {
    return res.status(200).json({ ok: true, ...cached.payload });
  }

  const stateRow = await fetchStudentStateRow(supabaseAdmin, profileId);
  const submitCount = num(stateRow?.record_count) ?? 0;

  const input = await buildPromptInput(
    supabaseAdmin,
    profileId,
    source,
    gate.row,
    submitCount,
    now,
  );

  let origin: "ai" | "rule" = "ai";
  let modelResult: AdviceModelResult;
  try {
    const prompt = buildAdvicePrompt(input);
    modelResult = await generateAdviceModelResult(prompt);
  } catch (error) {
    console.warn("goal/advice Gemini 호출 실패, 규칙 기반으로 대체:", error);
    origin = "rule";
    modelResult = buildRuleFallback(input);
  }

  const payload = buildAdvicePayload(input, modelResult, origin);

  await upsertAdviceCache(supabaseAdmin, {
    profile_id: profileId,
    source,
    generated_for: todayYmd,
    origin,
    payload,
  });

  return res.status(200).json({ ok: true, ...payload });
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
    console.error("goal/advice error:", error);
    return sendError(res, "detail", 500, "처리 중 오류가 발생했습니다.");
  }
}
