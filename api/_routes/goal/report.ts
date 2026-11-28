// GET /api/goal/report?type=weekly|monthly|direction&period=...&track=naesin|jeongsi&reportId=...&studentId=...
// (reportId는 type=direction 전용 — 저장된 goal_direction_reports 행의 id. period는
// weekly/monthly 전용으로 남는다.)
// Authorization: Bearer <access_token>
//
// 성장 리포트(#33 주간 / #34 월간) + 학습방향 리포트(#37 내신 / #38 정시) 단일 조회
// 엔드포인트. 하우스 스타일은 api/_routes/goal/student.js·daily-record.js 그대로 따른다 —
// GET-only(조회형), 405 → 401(openGoalSession) → 미결제 200 {allowed:false} →
// 온보딩 게이트 409 → 400(쿼리 검증) → 500.
//
// studentId(선택, QA 시트 행210) — 학부모가 마이페이지 자녀 카드에서 자녀의 목표관리
// 성장 리포트를 열람하는 경로다. 생략하면 기존 동작 그대로(요청자 본인 리포트).
// 있으면 weekly/monthly 전용이다(direction은 이번 범위 밖 — 함께 오면 400). 요청자가
// 곧 그 학생이 아니면 fn_is_linked_pair(goalRepo.checkLinkedPair)로 approved 학부모-학생
// 쌍인지 서버가 재확인하고, 아니면 403 {error:{code:"NOT_LINKED", message}}(coded shape,
// api/_lib/httpResponse.ts)를 돌려준다. 통과하면 그 뒤 파이프라인(이용권 allowed 판정 —
// 이번엔 요청자가 아니라 studentId 기준으로 다시 계산한다·온보딩 게이트·weekly/monthly
// 집계)은 본인 조회 경로와 완전히 동일하게 studentId를 대상으로 실행한다. 학부모 열람은
// 읽기 전용이고 buildGrowthReport 내부는 전부 조회(fetch*)뿐이라 건너뛸 부수효과가 없다
// (direction 전용 ensureDirectionReports의 저장은 direction 자체가 막혀 있어 자연히
// 도달하지 않는다).
//
// 집계 산술은 전부 src/lib/goal/report/aggregate.js(순수 함수, supabase 미의존)에
// 있다, 이 파일은 DB 조회(api/_lib/goal/repo.ts), aggregate.js 입력 조립,
// insights.js 자연어 슬롯 → UI가 기대하는 report 응답 모양(GrowthReportBody.jsx /
// DirectionReportBody.jsx가 지금까지 goalReportMock.js에서 그대로 읽던 그 모양)으로
// 되돌리는 배선만 한다.
//
// 기간 경계는 순수 달력이다 — 주간 period='그 주 월요일 YMD',
// 월간 period='YYYY-MM'. 생략하면 오늘(학생 현지) 기준 이번 주/이번 달로 기본값 처리한다.

import { GOAL_ERROR } from "../../../shared/goal/contract.js";
import { reportQuery } from "../../../shared/goal/report.js";
import { startEarly } from "../../../src/lib/concurrency/startEarly.js";
import { GRADE_PERCENTILE } from "../../../src/lib/goal/calc/jeongsi.js";
import {
  bucketTimeSlots,
  buildMonthlyWeeks,
  buildWeeklyStudyTimeBars,
  computeAchievementRate,
  computeAdmissionDelta,
  computeCohortPercentile,
  computeCompletionScore,
  computeConditionBreakdown,
  computeCoreItems,
  computeDistraction,
  computeEffectiveWindow,
  computeStudyHours,
  computeSubjectShare,
  listReportPeriodOptions,
  type MonthlyWeekBar,
  resolveMonthlyPeriod,
  resolveWeeklyPeriod,
  round1,
  sumHoursByProfile,
  summarizePlanTaskCompletion,
  toNum,
} from "../../../src/lib/goal/report/aggregate.js";
import {
  buildConditionTip,
  buildCoreItemsTip,
  buildDistractionTip,
  buildHeroNarrative,
  buildMonthlyExpectedEffect,
  buildMonthlyLearningType,
  buildMonthlyStrategy,
  buildSubjectShareTip,
  buildTimeSlotTip,
} from "../../../src/lib/goal/report/insights.js";
import { addDaysYmd, dayStartUtc, ymdIn } from "../../../src/lib/time/day.js";
import { buildGoalDirectionReport } from "../../_lib/goal/directionReport.js";
import { goalFail } from "../../_lib/goal/problem.js";
import {
  checkLinkedPair,
  fetchActiveCohortProfileIds,
  fetchDailyRecordsForProfilesInRange,
  fetchEarliestProbabilityLog,
  fetchMentorComment,
  fetchPlanTasksInRange,
  fetchProbabilityLogAtOrBefore,
  fetchRecordsInRange,
  fetchStudentRow,
  fetchTimerSessionsInRange,
  getStudentTimeZone,
  hasGoalAccessFor,
  listGoalDirectionReports,
  narrowGoalSession,
  openGoalSession,
  saveGoalDirectionReport,
} from "../../_lib/goal/repo.js";
import { type UserEnv, userFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, problemResponse } from "../../_lib/hono/problem.js";
import { user } from "../../_lib/hono/user.js";
import { validate } from "../../_lib/hono/validate.js";
import { tenantReasonExtra } from "../../_lib/tenantUsage.js";

function formatHoursMinutesLabel(hoursFloat) {
  const totalMinutes = Math.round(hoursFloat * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m}분`;
  if (m <= 0) return `${h}시간`;
  return `${h}시간${m}분`;
}

// ---------------------------------------------------------------------------
// 성장 리포트(주간/월간)
// ---------------------------------------------------------------------------

/** 기간(현지 YMD, 양끝 포함)을 확률 스냅샷 조회용 UTC 경계 [현지 시작, 다음 현지 시작)로 바꾼다. */
export function snapshotBounds(
  period: { start: string; end: string },
  timeZone: string,
): { startIso: string; endExclusiveIso: string } {
  return {
    startIso: dayStartUtc(period.start, timeZone),
    endExclusiveIso: dayStartUtc(addDaysYmd(period.end, 1), timeZone),
  };
}

async function buildGrowthReport({
  supabaseAdmin,
  profileId,
  student,
  type,
  periodParam,
  nowYmd,
  timeZone,
}) {
  const period =
    type === "monthly"
      ? resolveMonthlyPeriod(periodParam, nowYmd)
      : resolveWeeklyPeriod(periodParam, nowYmd);

  const effectiveWindow = computeEffectiveWindow({
    periodStart: period.start,
    periodEnd: period.end,
    actualStartDate: student.actual_start_date,
    nowYmd,
  });

  // 합격 가능성 변화는 기간 시작 이전 최신 스냅샷과 기간 끝까지 최신 스냅샷의 차다.
  // 스냅샷 조회는 lte 라서 끝 경계는 다음 현지 시작 1ms 전으로 둔다(반열린 구간).
  // 경계는 기간과 시간대로 정해져 다른 읽기를 기다릴 필요가 없다.
  const bounds = snapshotBounds(period, timeZone);
  const startBoundaryIso = bounds.startIso;
  const endBoundaryIso = new Date(
    new Date(bounds.endExclusiveIso).getTime() - 1,
  ).toISOString();

  const [
    records,
    sessions,
    planTasks,
    cohortProfileIds,
    mentorComment,
    startLogAtOrBefore,
    endLogAtOrBefore,
  ] = await Promise.all([
    fetchRecordsInRange(supabaseAdmin, profileId, period.start, period.end),
    fetchTimerSessionsInRange(
      supabaseAdmin,
      profileId,
      period.start,
      period.end,
    ),
    fetchPlanTasksInRange(supabaseAdmin, profileId, period.start, period.end),
    fetchActiveCohortProfileIds(
      supabaseAdmin,
      student.ideal_university,
      student.ideal_department,
    ),
    fetchMentorComment(supabaseAdmin, profileId, type, period.periodKey),
    fetchProbabilityLogAtOrBefore(supabaseAdmin, profileId, startBoundaryIso),
    fetchProbabilityLogAtOrBefore(supabaseAdmin, profileId, endBoundaryIso),
  ]);

  const totalStudyHours = computeStudyHours(records);
  const { idealRate, minRate, minTargetHours } = computeAchievementRate({
    totalStudyHours,
    student,
    effectiveWindow,
  });

  // "기록 제출일수" — 순공 시간이 실제로 기록된 날(카드-only로 0시간만 찍힌 날은 세지 않는다).
  // toNum은 null을 돌려줄 수 있다 — null > 0은 JS에서 false(0으로 강제 변환)와 동일하므로
  // ?? 0은 동작을 바꾸지 않고 타입만 좁힌다.
  const recordDays = records.filter(
    (r) => (toNum(r.study_hours) ?? 0) > 0,
  ).length;
  // status가 단일 원본(QA 행305) — done 컬럼은 하위 호환 파생값이라 여기서는
  // 읽지 않는다. summarizePlanTaskCompletion이 status 없는/알 수 없는 값을
  // pending으로 방어한다.
  const planTaskSummary = summarizePlanTaskCompletion(planTasks);
  const doneTasks = planTaskSummary.done;
  const totalTasks = planTaskSummary.total;
  const completionScore = computeCompletionScore({
    idealRate,
    recordDays,
    elapsedDays: effectiveWindow.elapsedDays,
    doneTasks,
    totalTasks,
  });

  // D4 — 목표군 내 위치. 본인 값은 이미 computeStudyHours로 구했으니 코호트 조회 결과에서
  // 덮어써 이중 집계 오차를 없앤다. 코호트 조회에 잡히지 않은(그 기간 기록이 0건인) 학생은
  // sumHoursByProfile 결과에 아예 나타나지 않으므로 0시간으로 채워 넣는다.
  // 처음 스냅샷 읽기는 기간 이전 스냅샷이 없을 때만 필요하고 코호트 기록 읽기와 서로 기다릴 필요가 없다.
  const [cohortRecords, startLog] = await Promise.all([
    fetchDailyRecordsForProfilesInRange(
      supabaseAdmin,
      cohortProfileIds,
      period.start,
      period.end,
    ),
    startLogAtOrBefore ?? fetchEarliestProbabilityLog(supabaseAdmin, profileId),
  ]);
  const cohortHoursMap = new Map(
    sumHoursByProfile(cohortRecords).map((x) => [x.profileId, x.hours]),
  );
  const cohortHours = cohortProfileIds.map((pid) => ({
    profileId: pid,
    hours: pid === profileId ? totalStudyHours : cohortHoursMap.get(pid) || 0,
  }));
  const cohortPercentile = computeCohortPercentile(profileId, cohortHours);

  const conditionBreakdown = computeConditionBreakdown(records);
  const subjectShare = computeSubjectShare(sessions);
  const timeSlotBuckets = bucketTimeSlots(sessions, timeZone);
  const distraction = computeDistraction(records);
  const coreItems = computeCoreItems(records);

  const endLog = endLogAtOrBefore ?? startLog;

  const admissionArgs = {
    targets: {
      ideal: {
        university: student.ideal_university,
        department: student.ideal_department,
      },
      min: {
        university: student.min_university,
        department: student.min_department,
      },
    },
    startLog,
    endLog,
  };
  const admission = computeAdmissionDelta(admissionArgs);

  const heroNarrative = buildHeroNarrative({
    period: type,
    totalStudyHours,
    idealRate,
    minRate,
    completionScore,
    recordDays,
    elapsedDays: effectiveWindow.elapsedDays,
    periodStart: period.start,
    periodEnd: period.end,
    nowYmd,
  });

  const positionKpi = cohortPercentile.insufficientSample
    ? "표본 부족"
    : `상위 ${cohortPercentile.topPercent}%`;

  const kpis = [
    {
      label:
        type === "monthly"
          ? `${Number(period.periodKey.slice(5, 7))}월 공부 시간`
          : "이번 주 공부 시간",
      value: formatHoursMinutesLabel(totalStudyHours),
    },
    { label: "이상 목표 달성률", value: `${idealRate}%` },
    { label: "최소 목표 달성률", value: `${minRate}%` },
    {
      label: type === "monthly" ? "월간 완성도" : "주간 완성도",
      value: `${completionScore}점`,
    },
    { label: "목표군 내 위치", value: positionKpi },
  ];

  const achievementRows = [
    { label: "이상 목표", value: idealRate, max: 100 },
    { label: "최소 목표", value: minRate, max: 100 },
  ];

  // aggregate.js(범위 밖) 반환 타입 미정 — biome noImplicitAnyLet 회피용 최소 타입.
  let studyTimeBars: unknown[];
  let monthlyWeeks: MonthlyWeekBar[] = [];
  if (type === "monthly") {
    monthlyWeeks = buildMonthlyWeeks({
      records,
      student,
      monthStart: period.start,
      monthEnd: period.end,
      nowYmd,
    });
    studyTimeBars = monthlyWeeks.map((w) => ({
      label: w.label,
      value: w.hours,
    }));
  } else {
    studyTimeBars = buildWeeklyStudyTimeBars(records, period.start);
  }

  // monthly에서만 뒤이어 strategy 키를 추가한다(아래) — 조건부 확장 shape이라
  // 넓은 인덱스 타입으로 선언한다(응답은 res.json 으로 그대로 나가고 이 함수
  // 내부에서 report.xxx로 재조회하지 않는다).
  const report: Record<string, unknown> = {
    period: type,
    heading: type === "monthly" ? "월간 성장 리포트" : "주간 성장 리포트",
    periodLabel: period.periodLabel,
    // 지난 리포트 선택용. 시작일은 actual_start_date, 없으면 onboarded_at 의 학생 현지 날짜다.
    periodOptions: listReportPeriodOptions(
      type,
      student.actual_start_date ||
        ymdIn(new Date(student.onboarded_at), timeZone),
      nowYmd,
    ),
    activePeriod: period.periodKey,
    hero: { narrative: heroNarrative, kpis },
    overview: {
      label: "한눈에 보기",
      subLabel:
        type === "monthly"
          ? "이번 달 목표・공부량・컨디션"
          : "이번 주 목표・공부량・컨디션",
      achievement: {
        title:
          type === "monthly"
            ? "이번 달 목표 달성 현황"
            : "이번 주 목표 달성 현황",
        rows: achievementRows,
        weeks:
          type === "monthly"
            ? monthlyWeeks.map((w) => ({
                label: w.weekLabel,
                min: w.minRate,
                upper: w.idealRate,
              }))
            : undefined,
      },
      studyTime: {
        title: type === "monthly" ? "주차별 공부 시간" : "요일별 공부 시간",
        unit: "h",
        bars: studyTimeBars,
      },
      condition: {
        title: type === "monthly" ? "이번 달 컨디션" : "이번 주 컨디션",
        rows: conditionBreakdown.listRows,
      },
    },
    execution: {
      label: "실행 분석",
      subLabel: "계획을 어떻게 지켰는지",
      // 행305 — 대시보드 오늘의 계획 ✓/✕가 이제 done/fail을 구분해 저장하므로
      // (goal_plan_tasks.status) 주간/월간 리포트에도 달성/미달성/미기록
      // 3종 집계를 함께 실어 보낸다.
      planCompletion: {
        title: type === "monthly" ? "이번 달 계획 이행" : "이번 주 계획 이행",
        rows: [
          { label: "달성", value: planTaskSummary.done },
          { label: "미달성", value: planTaskSummary.fail },
          { label: "미기록", value: planTaskSummary.pending },
        ],
        total: planTaskSummary.total,
      },
      subjectShare: {
        title: "과목별 학습 비중",
        empty: subjectShare.empty,
        emptyMessage: "타이머 과목 데이터가 아직 충분히 누적되지 않았습니다.",
        rows: subjectShare.rows,
        tip: buildSubjectShareTip(subjectShare),
      },
      timeSlot: {
        title: "시간대별 학습 효율",
        rows: timeSlotBuckets,
        tip: buildTimeSlotTip(timeSlotBuckets),
      },
      distraction: {
        title: "학습 방해요인 분석",
        rows: distraction,
        tip: buildDistractionTip(distraction),
      },
    },
    outcome: {
      label: "성과의 변화",
      subLabel: "무엇을 끝냈고, 목표에 얼마나 가까워졌는지",
      coreItems: {
        title: "완료한 핵심 학습 항목",
        rows: coreItems,
        tip: buildCoreItemsTip(coreItems),
      },
      conditionTiles: {
        title: "컨디션별 학습량",
        tiles: conditionBreakdown.tiles,
        tip: buildConditionTip(conditionBreakdown.tiles),
      },
      admission: { title: "합격 가능성 변화" },
    },
    admission,
    mentorComment: mentorComment
      ? {
          title: "멘토 코멘트",
          // 표시 문자열은 클라이언트가 브라우저 시간대로 만든다.
          writtenAt: new Date(mentorComment.written_at).toISOString(),
          body: mentorComment.body,
        }
      : null,
  };

  if (type === "monthly") {
    const bestWeek =
      monthlyWeeks.length > 0
        ? monthlyWeeks.reduce((a, b) => (b.minRate > a.minRate ? b : a))
        : null;
    const learningType = buildMonthlyLearningType({
      idealRate,
      minRate,
      recordDays,
      elapsedDays: effectiveWindow.elapsedDays,
      bestWeek,
    });
    report.strategy = {
      label: "다음 달 전략",
      subLabel: "지금 유형에서 무엇부터 바꿀지",
      learningType: { title: "이번 달 학습 유형 진단", ...learningType },
      plan: {
        title: "다음 달 관리 전략",
        rows: buildMonthlyStrategy({
          distraction,
          weeks: monthlyWeeks,
          minTargetHours,
        }),
      },
      expectedEffect: {
        title: "기대 효과",
        ...buildMonthlyExpectedEffect({ subjectShare, idealRate }),
      },
    };
  }

  return report;
}

// ---------------------------------------------------------------------------
// 학습방향 리포트(내신/정시), QA 행301. 저장, 이력 기반(api/_lib/goal/directionReport.ts
// 빌더 + goal_direction_reports 테이블). 조회 때마다 즉석 계산만 하던 이전 구현을
// 대체한다 — periodChips는 이제 회차 옵션이 아니라 저장된 리포트 목록(최신순),
// activePeriod/조회 파라미터는 그 리포트의 id(reportId)다.
// ---------------------------------------------------------------------------

/** track('naesin'|'jeongsi') → 빌더 kind('naesin'|'jungsi'). 철자가 다른 두 어휘를 여기서만 잇는다. */
function trackToKind(track) {
  return track === "jeongsi" ? "jungsi" : "naesin";
}

/** 저장된 리포트 payload → 과목 카드 배지 문자열. 내신은 등급만, 정시는 "백분위 N · M등급"(§설계 5). */
function formatSubjectBadge(kind, grade, percentile) {
  if (grade == null) return "미입력";
  if (kind === "naesin") return `${grade.toFixed(2)} 등급`;
  return percentile != null
    ? `백분위 ${percentile} · ${grade}등급`
    : `${grade}등급`;
}

/**
 * 저장 리포트가 하나도 없는 학생(기존 학생, 마이그레이션 이전 온보딩) 대비 —
 * GET 조회 시 온보딩 원본값으로 1건을 즉석 생성해 저장한다(source_type='intake',
 * source_label='내 현재 위치'). 이후 조회부터는 이 저장된 행이 목록에 잡힌다.
 */
async function ensureDirectionReports(supabaseAdmin, profileId, student, kind) {
  const existing = await listGoalDirectionReports(
    supabaseAdmin,
    profileId,
    kind,
  );
  if (existing.length > 0) return existing;

  const legacyEntry =
    kind === "naesin"
      ? { value: toNum(student.converted_grade) }
      : { value: toNum(student.current_mogo) };

  const { payload, snapshot } = buildGoalDirectionReport({
    kind,
    sourceType: "intake",
    sourceLabel: "내 현재 위치",
    grade: student.grade,
    naesinScores: student.naesin_scores,
    mockExamScores: student.mock_exam_scores,
    legacyEntry,
    gradePercentile: GRADE_PERCENTILE,
  });

  const saved = await saveGoalDirectionReport(supabaseAdmin, profileId, {
    kind,
    sourceType: "intake",
    sourceLabel: "내 현재 위치",
    payload,
    snapshot,
  });

  return [saved];
}

async function buildDirectionReport({
  supabaseAdmin,
  profileId,
  student,
  track,
  reportIdParam,
  timeZone,
}) {
  const kind = trackToKind(track);
  const reports = await ensureDirectionReports(
    supabaseAdmin,
    profileId,
    student,
    kind,
  );

  const chosen =
    reports.find((r) => String(r.id) === String(reportIdParam)) || reports[0];
  const payload = chosen.payload;
  const nowYmd = ymdIn(new Date(), timeZone);

  const subjects = payload.subjectReports.map((s) => ({
    key: s.key,
    name: s.label,
    grade: s.grade,
    percentile: s.percentile,
    pyramidLevel: s.pyramidLevel,
    zoneLabel: s.status,
    badge: formatSubjectBadge(kind, s.grade, s.percentile),
    body: s.direction,
    materials: s.books,
  }));

  const meta = `${payload.scaleMax}등급제 · ${nowYmd.replace(/-/g, ".")}`;

  return {
    tab: track,
    heading: chosen.source_label,
    meta,
    periodChips: reports.map((r) => ({
      value: String(r.id),
      label: r.source_label,
    })),
    activePeriod: String(chosen.id),
    scaleMax: payload.scaleMax,
    overallAverage: payload.overallAverage,
    summary: {
      meta,
      typeLabel: payload.studentType.title,
      body: payload.studentType.summary,
    },
    subjects,
  };
}

// ---------------------------------------------------------------------------
// 핸들러
// ---------------------------------------------------------------------------

const guard = user({
  unhandledMessage: "처리 중 오류가 발생했습니다.",
  logLabel: "goal/report",
});

export const report = userFactory
  .createApp()
  .get("/", guard, validate("query", reportQuery), async (c) => {
    try {
      const session = await openGoalSession(c);

      const { supabaseAdmin, profileId: requesterId } =
        narrowGoalSession(session);

      const query = c.req.valid("query");
      const { type, studentId } = query;
      if (studentId && type === "direction") {
        return goalFail(c, 400, {
          detail: "studentId는 weekly|monthly 조회에서만 사용할 수 있습니다.",
        });
      }

      // 학부모가 자녀 리포트를 여는 경로 — profileId를 요청자에서 자녀로 바꿔치기하기 전에
      // 먼저 승인된 쌍인지 서버가 재확인한다(UI 게이트인 fn_parent_children와는 별개 축).
      let profileId = requesterId;
      let allowed = session.allowed;
      if (studentId && studentId !== requesterId) {
        const linked = await checkLinkedPair(
          supabaseAdmin,
          requesterId,
          studentId,
        );
        if (!linked) {
          return problemResponse(
            c,
            403,
            "연결된 자녀가 아닙니다.",
            GOAL_ERROR.NOT_LINKED,
          );
        }
        profileId = studentId;
        allowed = await hasGoalAccessFor(supabaseAdmin, profileId);
      }

      // 조회형 규약 — student.js와 동일하게 미결제는 에러가 아니다.
      if (!allowed) {
        return c.json({
          allowed: false,
          // 자녀 열람(학부모)의 판정은 요청자 사유가 아니라서 싣지 않는다.
          ...(profileId === requesterId
            ? tenantReasonExtra(session.tenantReason)
            : {}),
        });
      }

      // 시간대 읽기는 학생 확인과 함께 시작한다. 확인이 막으면(409) 시간대 결과는 쓰지 않는다.
      const timeZoneRead = startEarly(
        getStudentTimeZone(supabaseAdmin, profileId),
      );
      const student = await fetchStudentRow(supabaseAdmin, profileId);

      // daily-record.js requireActiveStudent와 동일한 판정 순서 — 온보딩 미완료/컷 대기 학생은
      // 리포트를 만들 데이터 기반(rate/cut)이 없다.
      if (!student?.onboarded_at) {
        return goalFail(c, 409, { reason: "not_onboarded" });
      }
      if (student.status !== "active") {
        return goalFail(c, 409, { reason: "awaiting_cuts" });
      }

      const timeZone = await timeZoneRead;
      const nowYmd = ymdIn(new Date(), timeZone);

      if (type === "direction") {
        const track = query.track === "jeongsi" ? "jeongsi" : "naesin";
        const report = await buildDirectionReport({
          supabaseAdmin,
          profileId,
          student,
          track,
          reportIdParam: query.reportId,
          timeZone,
        });
        return c.json({ report });
      }

      const report = await buildGrowthReport({
        supabaseAdmin,
        profileId,
        student,
        type,
        periodParam: query.period,
        nowYmd,
        timeZone,
      });
      return c.json({ report });
    } catch (error) {
      console.error("goal/report error:", error);
      return goalFail(c, 500, { detail: "처리 중 오류가 발생했습니다." });
    }
  })
  .all("/", methodNotAllowed("GET"));
