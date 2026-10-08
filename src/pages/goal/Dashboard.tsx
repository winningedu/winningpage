import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import AchievementChart from "@/components/goal/dashboard/AchievementChart";
import AdviceCard from "@/components/goal/dashboard/AdviceCard";
import DashboardPageHeader from "@/components/goal/dashboard/DashboardPageHeader";
import MockExamCard from "@/components/goal/dashboard/MockExamCard";
import NaesinCard from "@/components/goal/dashboard/NaesinCard";
import RankingRail from "@/components/goal/dashboard/RankingRail";
import ScheduleRail from "@/components/goal/dashboard/ScheduleRail";
import StudyPlanRail from "@/components/goal/dashboard/StudyPlanRail";
import TargetUniversityRail from "@/components/goal/dashboard/TargetUniversityRail";
import TodayGoalCard from "@/components/goal/dashboard/TodayGoalCard";
import TomorrowPlanCard from "@/components/goal/dashboard/TomorrowPlanCard";
import GoalCard from "@/components/goal/GoalCard";
import { QUICK_ADD_HOURS } from "@/components/goal/goalFormOptions";
import GapToTargetCard from "@/components/goal/study/GapToTargetCard";
import { DEFAULT_TIMER_SUBJECTS } from "@/components/goal/studyRecordOptions";
import { getSubjectLabel } from "@/components/goal/subjectTokens";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/context/AuthProvider";
import {
  getDayIndexFromYMDServer,
  kstYMD,
  VIRTUAL_DAY_NAMES,
} from "@/lib/goal/calc/index.js";
import { buildZoneGapRows } from "@/lib/goal/gapToTarget";
import {
  formatScheduleDday,
  formatScheduleMeta,
} from "@/lib/goal/scheduleDday";
import { mapTargetUniversities } from "@/lib/goal/targetUniversities";
import type { FetchTodayGoalRecordResult } from "@/lib/goalApi";
import {
  fetchGoalAdvice,
  fetchGoalRanking,
  fetchGoalSchedules,
  fetchGoalTimer,
} from "@/lib/goalApi";
import { formatTodayDateLabel } from "@/lib/goalPlanUtils";
import {
  goalDailyRecordQueryOptions,
  goalStudentQueryOptions,
  queryClient,
} from "@/lib/queryClient";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
// QA 행303-1 — 저장 완료 배너 자동 소멸 시간. DailyRecord.tsx의
// HIGHLIGHT_AUTO_DISMISS_MS(2초)보다 길게 둔다 — 이동 직후 읽을 시간이 필요하다.
const SAVED_RECORD_BANNER_MS = 4000;

// QA 행295, 306, AI 조언(GET /api/goal/advice, api/_lib/goal/advice.ts)이 실제로 배선됐다
// (이전 주석 "이식 대상이 아니다"는 규칙 기반 3요소로 대체하기로 한 결정이었으나
// 2026-09-02 팀장 지시로 번복됐다 — qa3-held-high-design.md §6 결정⑥). 웰컴 카드
// headline은 여전히 규칙 기반(buildTodayHeadline)이 기본값이고, intake 조언이 있을 때만
// 그 probabilitySummary로 교체한다(아래 advice 조립부 참고). AdviceCard/TomorrowPlanCard
// 본문은 advice.sections/majorTips를 그대로 그린다 — "AI 입시 분석 조언" 뱃지는
// DashboardPageHeader의 adviceType prop으로 origin==='ai'일 때만 뜬다(원본 실제 AI 생성
// 여부와 UI 뱃지가 이제 일치한다). 컴플라이언스 필터(반드시/100%/보장/낙인 문구 금지)는
// 서버(api/_lib/goal/advice.ts postprocessAdviceText)가 적용한다, 이 파일은 규칙 기반
// 폴백(buildTodayHeadline/buildTomorrowPlan)에서 학생명만 넣지 않으면 된다(사이드바가
// 이미 표기).

/** 소수 시간을 "N시간 M분"/"N시간"/"M분"으로. 0 이하는 호출부가 걸러야 한다. */
function formatHoursLabel(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m}분`;
  if (m <= 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

/**
 * 웰컴 카드 headline — "오늘의 조언". 오늘 기록(studyHours)과 오늘 이상 목표 시간만
 * 비교하는 규칙 기반 문구다(AI 생성 아님). idealHours<=0은 스케줄 미설정(온보딩
 * 직후 등)이라 시간 언급 없이 시작을 권한다.
 *
 * QA 행304 — 오늘의 조언에 "오늘 달성률 N% (목표 대비)"가 없었다. 기록이 있고 이상
 * 목표 시간이 설정된 경우에만 붙인다(TodayGoalCard의 upperGoalRate와 같은 계산식,
 * 규칙 기반 — LLM 도입 없음).
 */
export function buildTodayHeadline(
  idealHours: number,
  studyHours: number,
): string {
  if (studyHours <= 0) {
    return idealHours > 0
      ? `아직 오늘의 학습 기록이 없어요. 오늘 목표는 ${formatHoursLabel(idealHours)}이에요.`
      : "아직 오늘의 학습 기록이 없어요. 오늘부터 시작해볼까요?";
  }
  if (idealHours <= 0) {
    return "오늘 목표를 지켰어요! 이 페이스를 이어가 봐요.";
  }
  const rate = Math.min(100, Math.round((studyHours / idealHours) * 100));
  const remaining = idealHours - studyHours;
  if (remaining <= 0) {
    return `오늘 달성률 ${rate}% (목표 대비) · 오늘 목표를 지켰어요! 이 페이스를 이어가 봐요.`;
  }
  return `오늘 달성률 ${rate}% (목표 대비) · 오늘 목표까지 ${formatHoursLabel(remaining)} 남았어요.`;
}

// ---------------------------------------------------------------------------
// GET /api/goal/student → 4개 실데이터 카드(TargetUniversityRail/MockExamCard/
// NaesinCard/TodayGoalCard) prop 매핑. api/_lib/goal/repo.ts buildStudentPayload()
// 반환 shape을 기준으로 한다(임무 지시 "서버 계약" 절 그대로, 코드로 재확인 완료).
//
// 확률 스케일 확인: src/lib/goal/calc/pipeline.test.js가 idealSusi===100(포화)을
// 검증하므로 probs.* 는 0~100 스케일이다 — TargetUniversityRail의 susiRate/jeongsiRate
// (GoalProgressBar max=100, `{value}%`로 직접 렌더)와 스케일이 이미 일치해 변환은
// "반올림"뿐이다(소수점 노출 방지, 표시 목적).
// ---------------------------------------------------------------------------

// api/_lib/goal/repo.ts buildStudentPayload() 반환 shape 중 이 페이지가 실제로 읽는 필드만.
type GoalStudent = {
  jungsiAvailable: boolean;
  targets: {
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
  probs: {
    idealSusi?: number | null;
    idealJungsi?: number | null;
    minSusi?: number | null;
    minJungsi?: number | null;
  };
  weeklySchedule?: Record<string, { ideal: number; min: number }>;
  scores: {
    lastMogoExam?: string | null;
    currentMogo?: number | null;
    lastNaesinExam?: string | null;
    convertedGrade?: number | null;
  };
  probabilityHistory: Array<{
    recordedAt: string;
    idealSusi?: number | null;
    idealJungsi?: number | null;
    minSusi?: number | null;
    minJungsi?: number | null;
  }>;
};

// QA3 행305 — cooldown/summary/tomorrowTargets는 GET /api/goal/daily-record가
// 함께 내려주는 12시간 쿨다운 배선. TodayGoalCard도 이 페이지가 넘겨주는
// mapTodayGoal() 결과로만 잠금 상태를 안다(자체 재조회 없음). 후속(사이드바 뱃지
// 실배선) — goalApi.ts의 FetchTodayGoalRecordResult를 그대로 쓴다(로컬 사본을
// 따로 두지 않는다 — GoalSidebar.tsx도 같은 타입을 공유하는 goalDailyRecordQueryOptions
// 캐시를 구독하므로 shape이 어긋나면 즉시 타입 에러로 드러난다).
type DailyRecordResult = FetchTodayGoalRecordResult;

type RankingResult =
  | {
      kind: "ok";
      top: Array<{ rank: number; name: string; hours: number }>;
      me: { rank: number; name: string; hours: number } | null;
    }
  | { kind: "no-session" | "not-allowed" | "error" };

type ScheduleItem = {
  id?: number | string;
  title: string;
  dueDate: string;
  memo?: string | null;
};

type GoalStudentResult =
  | { kind: "onboarded"; student: GoalStudent }
  | {
      kind:
        | "no-session"
        | "error"
        | "not-allowed"
        | "not-onboarded"
        | "awaiting-cuts";
    };

type SchedulesResult =
  | { kind: "success"; schedules: ScheduleItem[] }
  | { kind: "no-session" | "not-allowed" | "error" };

/**
 * 주어진 시각이 속한 KST 요일의 student.weeklySchedule 항목. 오늘의 목표 카드(같은
 * 날)와 내일 계획 카드(다음 날, `now`에 +1일한 Date를 넘긴다)가 공유한다.
 * 스케줄이 없으면(온보딩 직후 등) {ideal:0, min:0}.
 */
function resolveDaySchedule(
  weeklySchedule: GoalStudent["weeklySchedule"],
  now = new Date(),
) {
  const dayIndex = getDayIndexFromYMDServer(kstYMD(now), now);
  // getDayIndexFromYMDServer는 항상 0~6을 반환하고 VIRTUAL_DAY_NAMES는 7개 고정이다.
  const dayName = VIRTUAL_DAY_NAMES[dayIndex]!;
  return weeklySchedule?.[dayName] || { ideal: 0, min: 0 };
}

/**
 * "오늘의 목표" 카드 데이터. GET /api/goal/daily-record 결과(dailyRecordResult)와
 * daySchedule(오늘 요일의 목표 시간, resolveDaySchedule 결과)을 합쳐 만든다.
 *
 * dailyRecordResult가 아직 없거나(로딩 중) 방어적 분기(kind !== 'success')면 studyHours=0
 * 인 빈 상태로 그린다 — TodayGoalCard의 hasRecord 파생(studyHours>0)과 자연히 맞는다.
 */
function mapTodayGoal(
  daySchedule: { ideal: number; min: number },
  dailyRecordResult: DailyRecordResult | null | undefined,
) {
  const success =
    dailyRecordResult?.kind === "success" ? dailyRecordResult : null;
  const studyHours = success?.record?.studyHours || 0;

  const rateOf = (targetHours: number) =>
    targetHours > 0
      ? Math.min(100, Math.round((studyHours / targetHours) * 100))
      : 0;

  return {
    studyHours,
    // 퀵칩 증분 목록 자체는 실데이터가 아니라 UI 상수다 — goalFormOptions.ts의
    // QUICK_ADD_HOURS를 그대로 재사용한다(사본을 새로 만들지 않는다).
    quickAddOptions: QUICK_ADD_HOURS,
    upperGoalRate: rateOf(daySchedule.ideal),
    lowerGoalRate: rateOf(daySchedule.min),
    // QA 행304 — 카드가 달성률 %만 보여주고 실제 이상/최소 목표 "시간(h)"이 어디에도
    // 안 보였다. daySchedule은 이미 서버가 온보딩 때 요일별로 계산해 저장한 값이라
    // (api/goal/intake.ts buildWeeklySchedule 이 채우는 study_schedule 컬럼, api/_lib/goal/repo.ts
    // buildStudentPayload가 weeklySchedule로 내려준다) 그대로 넘긴다 — 새로 계산하지 않는다.
    upperTargetHours: daySchedule.ideal,
    lowerTargetHours: daySchedule.min,
    // QA3 행305 — 12시간 쿨다운 배선. success가 아니면(로딩 중·에러) 잠금 없는
    // 것으로 취급한다 — 이 상태에서 카드는 어차피 studyHours=0 빈 상태다.
    cooldown: success?.cooldown ?? null,
    summary: success?.summary ?? null,
    tomorrowTargets: success?.tomorrowTargets ?? { idealHours: 0, minHours: 0 },
  };
}

/**
 * 과목별 배분 비율(합=1). fetchGoalTimer().summary.targets(goal_subject_targets, 학생이
 * 타이머 페이지에서 설정한 과목별 목표 시간)가 있으면 그 비율로, 하나도 없으면
 * DEFAULT_TIMER_SUBJECTS 4과목 균등 배분한다(Timer 페이지 기존 파생 규칙과 동일 폴백).
 */
function buildSubjectRatios(
  timerTargets: { subject: string; targetHours: number }[] | null,
): Record<string, number> {
  const relevant = (timerTargets || []).filter(
    (t) => DEFAULT_TIMER_SUBJECTS.includes(t.subject) && t.targetHours > 0,
  );
  const total = relevant.reduce((sum, t) => sum + t.targetHours, 0);

  if (total <= 0) {
    const equalShare = 1 / DEFAULT_TIMER_SUBJECTS.length;
    return Object.fromEntries(
      DEFAULT_TIMER_SUBJECTS.map((subject) => [subject, equalShare]),
    );
  }

  return Object.fromEntries(
    DEFAULT_TIMER_SUBJECTS.map((subject) => {
      const match = relevant.find((t) => t.subject === subject);
      return [subject, match ? match.targetHours / total : 0];
    }),
  );
}

/**
 * "내일 계획 제시" 카드(§3.16 ③) — 내일(KST) 이상 목표 시간을 과목별로 배분한다.
 * unit(단원)은 산출 근거가 없어 만들지 않는다(TomorrowPlanCard가 unit 없이도 자연스럽게
 * 그리도록 조정했다). 배분 결과가 0시간인 과목은 행 자체를 뺀다(억지 산출 금지).
 */
function buildTomorrowPlan(
  tomorrowIdealHours: number,
  timerTargets: { subject: string; targetHours: number }[] | null,
): { subject: string; duration: string }[] {
  if (tomorrowIdealHours <= 0) return [];

  const ratios = buildSubjectRatios(timerTargets);
  return DEFAULT_TIMER_SUBJECTS.map((subjectId) => ({
    subject: getSubjectLabel(subjectId),
    hours: tomorrowIdealHours * (ratios[subjectId] ?? 0),
  }))
    .filter((item) => item.hours > 0)
    .map((item) => ({
      subject: item.subject,
      duration: formatHoursLabel(item.hours),
    }));
}

function mapMockExam(student: GoalStudent) {
  const { lastMogoExam, currentMogo } = student.scores;
  return {
    // lastMogoExam 라벨은 api/goal/intake.js MOCK_ROUNDS와 동일('3모'/'6모'/'9모'/'10모').
    round: lastMogoExam ? `${lastMogoExam} 모의고사` : "모의고사 기록 없음",
    // 모의고사 카드는 D-day 소스가 없다(회차 일정 테이블 자체가 미생성 — 중요일정과 달리
    // 실데이터 전환 대상이 아니다) — dday 키를 생략하면 GoalDdayBadge가 빈 뱃지를 렌더한다
    // (React는 undefined 자식을 그리지 않는다). 가짜 날짜를 지어내지 않기 위한 선택.
    // exactOptionalPropertyTypes: optional 필드는 명시적 undefined 값을 받지 않으므로
    // 키 자체를 생략한다(동작은 이전과 동일).
    metricLabel: "현재 종합 백분위",
    metricValue: currentMogo != null ? currentMogo : "기록 없음",
    // QA 행295·306 — 과목별(모의고사 전용) 조언 데이터 소스가 없다(GET /api/goal/advice는
    // 오늘의 조언/내일 계획/학과 팁만 만든다, AdviceCard 소유). 실데이터인 척 만들지 않고
    // advice 키 자체를 생략한다 — MockExamCard가 이 필드가 없으면 "학습 조언" 블록을
    // 렌더하지 않는다(no-fallback-constants, dday 키 생략과 동일 패턴).
  };
}

// GET /api/goal/ranking 결과(kind:'ok') → RankingRail이 그리는 행 배열.
//
// "상위 5명 + 내 순위"를 두 블록 그대로 이어붙인다 — top(서버가 이미 "홍O동"으로
// 마스킹) 뒤에 me(본인 실명)를 별도 행으로 추가한다. 내 등수가 이미 top 안에
// 있어도(예: 내가 5등) 병합하지 않는다 — 동률일 때 top의 어느 행이 "나"인지
// 클라이언트가 rank/hours만 보고 추측해 그 자리를 내 실명으로 바꿔치기하면,
// 실제로는 다른 학생인 동률 상대의 마스킹 이름이 내 실명으로 뒤바뀌는 사고가
// 난다(마스킹은 서버 전용 — api/goal/ranking.js 파일 헤더 참고). 그 대가로 내가
// 상위 5명 안에 들면 같은 사람이 두 행(마스킹+실명)으로 중복 표시될 수 있다 —
// 이 페이지가 소유한 판단.
function mapRankingRows(rankingResult: RankingResult | null) {
  if (rankingResult?.kind !== "ok") return [];
  const rows = rankingResult.top.map((row) => ({ ...row, isSelf: false }));
  if (rankingResult.me) {
    rows.push({ ...rankingResult.me, isSelf: true });
  }
  return rows;
}

/**
 * 우측 레일 "중요일정 체크하기" 카드용 — 오늘(KST) 이후(오늘 포함) 마감일 중 가장 가까운
 * 3건. 지난 일정은 이 위젯(체크리스트 목적)에서 제외한다 — 전체 이력은
 * Schedules.jsx(/app/goal/schedules)가 담당한다(이번 UoW 판단 지점).
 */
function mapNearestSchedules(
  schedules?: ScheduleItem[] | null,
  now = new Date(),
) {
  const today = kstYMD(now);
  return [...(schedules || [])]
    .filter((schedule) => schedule.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3)
    .map((schedule) => ({
      ...schedule,
      dday: formatScheduleDday(schedule.dueDate, now),
      meta: formatScheduleMeta(schedule.dueDate, schedule.memo),
    }));
}

function mapNaesin(student: GoalStudent) {
  const { lastNaesinExam, convertedGrade } = student.scores;
  return {
    // NAESIN_ROUNDS 라벨 그대로('1학기 중간'/'1학기 기말'/'2학기 중간'/'2학기 기말').
    round: lastNaesinExam || "내신 기록 없음",
    metricLabel: "현재 내신 평균",
    metricValue:
      convertedGrade != null
        ? `${convertedGrade.toFixed(2)} 등급 (9등급 환산)`
        : "기록 없음",
    // mapMockExam과 동일 사유 — 과목별 조언 데이터 소스가 없어 키를 생략한다.
  };
}

// 목표관리 대시보드(#20 정본) 본문 — docs/figma-goal/00-INDEX.md §3 G2 / §5-4 / §6-3.
//
// 3존 레이아웃: 사이드바(GoalAppLayout 담당) │ 메인 1076px(67.25rem) │ 우측 레일 372px(23.25rem).
// 페이지 헤더(뱃지+날짜 기준+헤딩, `DashboardPageHeader`)는 메인+레일 2열 그리드의 1행에
// 메인 컬럼(col 1)만 차지하도록 배치한다(part-07 #20 세로 흐름표 — 뱃지/헤딩은 x=372~1065,
// 레일까지 가로지르지 않음). 메인 콘텐츠와 레일은 2행에 나란히 배치돼 같은 행 시작선을 공유하므로
// 우측 레일 첫 카드(y=272)가 메인 컬럼 첫 카드(오늘의 목표, y=271)와 자연스럽게 같은 높이에서
// 시작한다 — 헤더 높이만큼의 하드코딩 오프셋(구 pt-[10.6875rem]) 없이 grid row-gap만으로 해결.
// 1행→2행 간격(4.875rem = 78px)은 헤더 하단(y193)~메인 첫 카드(y271) 실측 간격 그대로다.
// 메인 세로 스택: 헤더 → 오늘의 목표 → 오늘의 조언/내일 계획 제시(2열) → 모의고사/내신(2열) →
// 학업 성취도 변화 추이. 우측 레일: 이상/최소 목표대학 → 학습 계획 → 중요일정 → 학습 순위, 전부
// flex column + gap(카드 세로 간격 20px = 1.25rem)으로 쌓아 가변 높이 카드를 절대 좌표 없이
// 수용한다(학습 계획 194↔342, 중요일정 194↔278).
//
// 조언 유형("일일 분석 조언" ↔ "AI 입시 분석 조언") 상태 축은 `DashboardPageHeader`의
// `adviceType` prop으로 옮겼다(part-06 #17/#18 뱃지 변형). 기본 렌더는 "오늘 기록 있음"(#20) ·
// adviceType="ai" 상태다. 미기록 축(studyHours=0, tomorrowPlan=[])은 실데이터가 그 값을
// 낼 때 위젯이 스스로 분기한다(TodayGoalCard의 hasRecord 파생, TomorrowPlanCard의 빈 배열
// 분기) — 컴포넌트 코드를 다시 건드릴 필요가 없다. AchievementChart는 실데이터
// (student.probabilityHistory) 기준이라 빈 상태는 이력 0~1건일 때 컴포넌트가 자체 분기한다.
export default function Dashboard() {
  // fetchGoalStudent() 결과를 discriminated union 그대로 보관한다(재가공하지 않는다 —
  // goalApi.js의 kind 계약을 이 컴포넌트가 다시 해석하는 지점을 하나로 좁혀 둔다).
  // useQuery(['goal','student'])는 requireGoalOnboardingDoneMiddleware(routeMiddleware.ts →
  // goalOnboarding.ts의 isOnboardingDone)가 이 라우트 진입 시 이미 채워 둔 캐시를
  // 그대로 읽는다(staleTime 15초, queryClient.ts, 캐시 키의 userId는 리뷰 C1) —
  // 이 컴포넌트가 마운트되며 GET /api/goal/student를 다시 부르지 않는다(명세
  // B-2 §7). data === undefined = 아직 응답 도착 전(로딩 중, 캐시 미스로 직접
  // 접근한 경우에만 발생). RequireGoalAccess가 이미 onboarded:true만 통과시키므로
  // 정상 경로에선 kind는 항상 'onboarded'다 — 그 외 kind는 전부 직접 URL 진입·
  // 세션 경쟁 상태 같은 방어적 분기다.
  const { userId } = useAuth();
  const { data: goalStudentData } = useQuery(goalStudentQueryOptions(userId));
  const result = (goalStudentData ?? null) as GoalStudentResult | null;

  // QA 행295·306 — GET /api/goal/advice(오늘자 캐시, 두 소스). 생성(POST)은
  // Onboarding.tsx/DailyRecord.tsx가 각자 성공 직후 fire-and-forget으로 호출한다 —
  // 이 쿼리는 그 결과를 읽기만 한다. queryKey는 DailyRecord.tsx의
  // invalidateQueries({queryKey:['goal','advice']})와 접두어가 일치해야 한다.
  const { data: goalAdviceData } = useQuery({
    queryKey: ["goal", "advice", userId] as const,
    queryFn: async () => {
      const r = await fetchGoalAdvice();
      return r.kind === "success" ? r : null;
    },
    enabled: !!userId,
    retry: 0,
  });

  // QA 행303-1 — "오늘의 공부 기록" 저장 성공 시 DailyRecord.tsx가 navigate state로
  // 델타(dailyRecordSaved)를 넘긴다. 최초 마운트에서 한 번만 꺼내 배너로 보여주고,
  // history state는 즉시 지운다 — 지우지 않으면 새로고침·뒤로가기로 이 페이지에
  // 재진입할 때마다 같은 배너가 되살아난다.
  const location = useLocation();
  const navigate = useNavigate();
  const [savedRecordBanner, setSavedRecordBanner] = useState<{
    idealSusi: number;
    minSusi: number;
  } | null>(null);

  // location/navigate를 의존성에 넣으면 아래 navigate(..., {state:null}) 호출로 location이
  // 바뀔 때마다 이 effect가 다시 돌아 방금 지운 state를 스스로 다시 읽는 무한 루프가 된다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 최초 마운트 시 진입 시점의 location.state를 1회만 확인하는 의도적 설계다.
  useEffect(() => {
    const state = location.state as {
      dailyRecordSaved?: { idealSusi: number; minSusi: number };
    } | null;
    if (!state?.dailyRecordSaved) return;

    setSavedRecordBanner(state.dailyRecordSaved);
    navigate(location.pathname, { replace: true, state: null });

    const timer = setTimeout(
      () => setSavedRecordBanner(null),
      SAVED_RECORD_BANNER_MS,
    );
    return () => clearTimeout(timer);
  }, []);
  // null = 로딩 중. kind가 'ok'가 아닌 나머지(no-session/not-allowed/error)는
  // mapRankingRows가 빈 배열로 접어 RankingRail의 빈 상태 문구로 흡수한다 —
  // 이 카드 하나 때문에 대시보드 전체를 에러 화면으로 떨어뜨리지 않는다.
  const [rankingResult, setRankingResult] = useState<RankingResult | null>(
    null,
  );

  // ScheduleRail(우측 레일 "중요일정 체크하기") 전용 — student 판정과 무관하게 독립 조회한다.
  // null = 로딩 중. 실패 시 빈 배열로 접는다 — 이 카드는 student처럼 페이지 전체를 막는
  // 필수 데이터가 아니라 조회 실패를 mock으로 되돌리지 않고 그냥 빈 상태로 보여준다.
  const [schedules, setSchedules] = useState<ScheduleItem[] | null>(null);

  // GET /api/goal/daily-record — "오늘의 목표" 카드 전용(studyHours) + 사이드바
  // "미기록" 뱃지(GoalSidebar.tsx)가 공유하는 캐시(goalDailyRecordQueryOptions,
  // 후속 실배선). data===undefined = 로딩 중. fetchGoalStudent()와 별도 캐시 키를
  // 쓴다 — 하나가 실패해도 다른 하나는 정상 렌더돼야 한다(예: daily-record 네트워크
  // 오류가 나도 목표대학·모의고사 카드는 그대로 보여야 함).
  const { data: dailyRecordResult } = useQuery(
    goalDailyRecordQueryOptions(userId),
  );

  // 내일 계획 제시(TomorrowPlanCard) 과목 배분 비율 전용 — GET /api/goal/timer의
  // targets(goal_subject_targets). null = 로딩 중/미설정 둘 다(buildSubjectRatios가
  // 빈 배열과 null을 동일하게 균등 배분 폴백으로 처리해 구분할 필요가 없다).
  const [timerTargets, setTimerTargets] = useState<
    { subject: string; targetHours: number }[] | null
  >(null);

  // 저장 성공 시 카드·게이지·사이드바 뱃지를 함께 최신화한다 — 캐시를 하나로
  // 공유하는 이유가 이 한 번의 invalidate로 셋 다 갱신되게 하기 위함이다
  // (goalDailyRecordQueryOptions 주석 참고).
  const reloadDailyRecord = () => {
    queryClient.invalidateQueries({
      queryKey: ["goal", "daily-record", userId],
    });
  };

  useEffect(() => {
    let alive = true;
    fetchGoalSchedules().then((r) => {
      if (!alive) return;
      const typed = r as SchedulesResult;
      setSchedules(typed.kind === "success" ? typed.schedules : []);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetchGoalRanking().then((r) => {
      if (alive) setRankingResult(r as RankingResult);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetchGoalTimer().then((r) => {
      if (alive && r.kind === "success") setTimerTargets(r.summary.targets);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 좌우 패딩(px-[3rem], 양쪽 합 6rem)을 바깥 래퍼로 옮긴다 — 기존엔 패딩이 max-w-goal-dashboard와
  // 같은 요소에 있어 그리드가 쓸 수 있는 가용 폭이 93rem - 6rem = 87rem으로 줄었는데, 자식 그리드는
  // `grid-cols-[67.25rem_23.25rem] gap-x-10` = 93rem 고정이라 6rem이 컨테이너를 넘쳤다
  // (결함2). 이제 max-w-goal-dashboard는 패딩의 영향을 받지 않는 안쪽 컨테이너에 붙어 93rem을
  // 온전히 쓴다. `max-w-goal-dashboard` 토큰 값(93rem) 자체는 그대로 둔다.
  //
  // QA 행292/328(2026-09-02) — 사이드바(20.25rem 고정) + 이 px-12(6rem) + 그리드 93rem 고정폭 =
  // 119.25rem(1908px)이 대시보드 최소 폭이라 1440/1536 노트북에서 우측 레일이 화면 밖으로
  // 밀려 body{overflow-x:hidden}(index.html)에 잘렸다(행292 "확률 게이지가 잘려 보임") — 그
  // 잘림이 브라우저에서는 "화면이 확대된 것처럼" 보인다(행328). 그리드 자체를 유동형으로 바꾼다
  // (아래 grid-cols-[minmax(0,1fr)_23.25rem], xl=80rem 미만은 1열 스택). 93rem 값·outerClassName은
  // 그대로 두고 그리드 트랙 정의만 고정 rem → minmax로 바꿔 max-w는 "상한"으로만 작동하게 한다.
  const outerClassName = "px-4 pb-24 pt-25 md:px-12";

  if (result === null) {
    return (
      <div className={outerClassName}>
        <div className="max-w-goal-dashboard">
          <GoalCard tone="neutral" className="px-8 py-7">
            <p className="text-app-body leading-[1.4] text-ink-sub">
              대시보드를 불러오는 중입니다…
            </p>
          </GoalCard>
        </div>
      </div>
    );
  }

  // 방어적 분기 — 정상 경로에선 RequireGoalAccess가 이미 걸러 여기 도달하지 않는다
  // (no-session/not-allowed/not-onboarded/awaiting-cuts는 3단계 게이트 대상,
  // error는 hasEntitlement 계열과 동일하게 "판정 불가"다). 크래시 대신 안내만 하고
  // 게이트가 다음 진입 때 다시 판정하도록 둔다 — 여기서 직접 리다이렉트하지 않는다.
  if (result.kind !== "onboarded") {
    const message =
      result.kind === "awaiting-cuts"
        ? "합격 기준 데이터를 준비 중입니다. 잠시 후 다시 확인해 주세요."
        : "대시보드 데이터를 불러오지 못했습니다. 새로고침해 주세요.";
    return (
      <div className={outerClassName}>
        <div className="max-w-goal-dashboard">
          <GoalCard tone="neutral" className="px-8 py-7">
            <p className="text-app-body leading-[1.4] text-ink-sub">
              {message}
            </p>
          </GoalCard>
        </div>
      </div>
    );
  }

  const { student } = result;
  const targetUniversities = mapTargetUniversities(student);
  // QA 행295 — 대시보드에 목표대학 격차(내신/백분위)를 3구간으로 보여준다. 컷이
  // 있는 대학만 행이 만들어진다(buildZoneGapRows가 null 축을 스스로 걸러낸다).
  const gapRows = buildZoneGapRows({
    naesin: {
      current: student.scores.convertedGrade ?? null,
      min: student.targets.min.naesinCut,
      ideal: student.targets.ideal.naesinCut,
    },
    mogo: {
      current: student.scores.currentMogo ?? null,
      min: student.targets.min.jungsiCut,
      ideal: student.targets.ideal.jungsiCut,
    },
  });
  const todayDaySchedule = resolveDaySchedule(student.weeklySchedule);
  const todayGoalData = mapTodayGoal(todayDaySchedule, dailyRecordResult);
  const mockExamData = mapMockExam(student);
  const naesinData = mapNaesin(student);

  const tomorrowDaySchedule = resolveDaySchedule(
    student.weeklySchedule,
    new Date(Date.now() + ONE_DAY_MS),
  );
  const tomorrowPlan = buildTomorrowPlan(
    tomorrowDaySchedule.ideal,
    timerTargets,
  );

  // QA 행295·306 — GET /api/goal/advice 결과(오늘자 캐시). daily가 있으면 daily를,
  // 없으면 intake를 우선한다(그날 아직 기록을 저장하지 않았으면 온보딩 직후 조언이
  // 가장 최신이다). 둘 다 없으면(로딩 중/아직 미생성) null — 카드가 스스로 빈 상태로
  // 그린다.
  const displayedAdvice =
    goalAdviceData?.daily ?? goalAdviceData?.intake ?? null;

  // 웰컴 카드 — headline은 기본 규칙 기반(buildTodayHeadline)이고, intake 조언이 오늘
  // 이미 생성돼 있으면 그 probabilitySummary로 교체한다(팀장 지시, AI가 실제로 만든
  // "최초 진단" 맥락 문장을 우선한다). badge는 DashboardPageHeader가 adviceType prop으로
  // 자체 렌더한다 — origin이 'ai'일 때만 "AI 입시 분석 조언", 그 외(rule/로딩 중)는
  // 기존 "일일 분석 조언" 변형을 그대로 쓴다(뱃지 문구 자체는 UI가 이미 갖고 있던 것).
  const advice = {
    headline:
      goalAdviceData?.intake?.probabilitySummary ??
      buildTodayHeadline(todayDaySchedule.ideal, todayGoalData.studyHours),
    adviceType: (displayedAdvice?.origin === "ai" ? "ai" : "daily") as
      | "ai"
      | "daily",
  };

  return (
    <>
      {/* QA 행303-1 — 기록 저장 직후 대시보드로 이동했을 때만 1회 뜨는 배너.
          DailyRecord.tsx의 fixed bottom 배너 톤(success)을 그대로 준용한다. */}
      {savedRecordBanner && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-8 z-55 mx-auto w-[calc(100%-2.5rem)] max-w-md rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-center text-app-body font-semibold text-green-700 shadow-[0_18px_45px_rgba(13,27,42,0.15)]"
        >
          {`기록을 저장했어요. 이상 목표 +${savedRecordBanner.idealSusi.toFixed(2)}%p · 최소 목표 +${savedRecordBanner.minSusi.toFixed(2)}%p`}
        </div>
      )}

      <div className={outerClassName}>
        <div className="max-w-goal-dashboard">
          <div className="grid grid-cols-1 gap-x-10 gap-y-19.5 xl:grid-cols-[minmax(0,1fr)_23.25rem]">
            <DashboardPageHeader
              adviceType={advice.adviceType}
              dateLabel={formatTodayDateLabel()}
              headline={advice.headline}
              className="xl:col-start-1 xl:row-start-1"
            />

            <div className="flex min-w-0 flex-col gap-5 xl:col-start-1 xl:row-start-2">
              {/* 오늘의 목표: GET /api/goal/daily-record(studyHours) + student.weeklySchedule(오늘
                목표 시간)을 합쳐 mapTodayGoal()이 만든 실데이터. 저장 성공 시
                reloadDailyRecord로 이 카드와 게이지를 함께 최신화한다.
                overflow-x-auto 래퍼(모바일 셸 대응, 2026-09-02) — TodayGoalCard 내부
                과목별 진행 행이 라벨/값 칼럼에 shrink-0 고정폭을 쓰고 있어 390px 좁은
                화면에서 총 필요폭이 컨테이너보다 커진다. 그 컴포넌트는
                src/components/goal/dashboard/(파일 소유권 별도, 위 TargetUniversityCard
                주석과 동일 사유) 소속이라 내부를 직접 고치지 않고, 넘치는 폭을 여기
                래퍼에서 가로 스크롤로 흡수한다(body의 overflow-x:hidden으로 조용히
                잘리던 값을 스크롤 가능하게 바꿔 정보 손실을 막는다). */}
              <ScrollArea axis="x">
                <TodayGoalCard
                  data={todayGoalData}
                  onSaved={reloadDailyRecord}
                />
              </ScrollArea>

              {/* QA 행292/328 — 원래 각 카드가 w-132.5(33.125rem) 고정이라 좌측 컬럼이 그리드
                트랙 폭과 무관하게 항상 67.25rem을 요구했다. flex-1 min-w-0으로 바꿔 좌측
                컬럼(위 xl:col-start-1)이 유동 폭을 받아도 두 카드가 함께 줄어들게 한다. */}
              <div className="flex gap-4">
                <div className="min-w-0 flex-1">
                  {/* AdviceCard: GET /api/goal/advice의 오늘 섹션(sections[0])+majorTips만
                    그린다(§QA 행295·306). "내일 계획 제시" 섹션은 TomorrowPlanCard 소유라
                    여기서는 참조하지 않는다(2026-09-02 후속 지시 — 두 카드 텍스트 중복 제거).
                    displayedAdvice가 null이거나 오늘 섹션이 아직 없으면(로딩 중/미생성)
                    제목만 그린다. */}
                  <AdviceCard
                    data={
                      displayedAdvice?.sections?.[0]
                        ? {
                            section: displayedAdvice.sections[0],
                            majorTips: displayedAdvice.majorTips,
                          }
                        : null
                    }
                  />
                </div>
                <div className="min-w-0 flex-1">
                  {/* TomorrowPlanCard: buildTomorrowPlan()의 과목별 시간 배분(규칙 기반, §3.16
                    ③, 그대로 유지) 위에 displayedAdvice의 "내일 계획 제시"/"다음 계획 제시"
                    본문(sections[1])만 문장으로 덧붙인다(AdviceCard는 더 이상 이 섹션을
                    그리지 않는다). 내일 목표 시간이 0/미설정이면 빈 배열이라 위젯이 스스로
                    "준비 중" 빈 상태를 그린다. */}
                  <TomorrowPlanCard
                    plan={tomorrowPlan}
                    narrative={displayedAdvice?.sections?.[1]?.body ?? null}
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <div className="min-w-0 flex-1">
                  <MockExamCard data={mockExamData} />
                </div>
                <div className="min-w-0 flex-1">
                  <NaesinCard data={naesinData} />
                </div>
              </div>

              {/* AchievementChart: goal_probability_logs 실이력(probabilityHistory, §api/_lib/goal/repo.ts
                buildStudentPayload) — 4계열(이상/최소 × 수시/정시) 라인 차트. */}
              <AchievementChart data={student.probabilityHistory} />

              {/* QA 행295 — 목표까지 남은 격차(내신/모의고사)를 대시보드에도 노출한다.
                  레일(23.25rem)은 label+description+remaining+advice 4줄 행을 담기엔
                  좁아 본문 하단에 배치했다(자의적 판단) — "내 목표 대학"
                  서브페이지와 같은 buildZoneGapRows/GapToTargetCard를 그대로 재사용해
                  두 화면의 문구·구간 판정이 갈리지 않는다. 컷이 전혀 없으면(온보딩
                  직후 등) gapRows가 빈 배열이라 카드를 렌더하지 않는다. */}
              {gapRows.length > 0 && <GapToTargetCard rows={gapRows} />}
            </div>

            <div className="flex min-w-0 flex-col gap-5 xl:col-start-2 xl:row-start-2">
              <TargetUniversityRail data={targetUniversities} />
              {/* StudyPlanRail: 오늘 과제 조회(GET /api/goal/plan-tasks)를 위젯이 직접 한다
                (StudyPlanRail.jsx 참고). Dashboard는 tasks를 내려주지 않는다. */}
              <StudyPlanRail />
              {/* ScheduleRail: GET /api/goal/schedules 실데이터, 가까운 순 3건(mapNearestSchedules). */}
              <ScheduleRail schedules={mapNearestSchedules(schedules)} />
              <RankingRail ranking={mapRankingRows(rankingResult)} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
