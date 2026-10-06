// 성장설계 리포트 생성(P4) 공유 계약. 순수 타입만 둔다. 모듈 간 드리프트를 막는 정본이다.
//
// 8단계(No.75): 1 활동 읽기 / 2 학년, 과목, 영역별 분류 / 3 반복 주제와 흐름 찾기 /
// 4 학생 조사 응답 대조 / 5 방향 일관성 계산 / 6 A~E 5축 진단 / 7 학년별 방향 설계 /
// 8 리포트 조립(화면 라벨은 "PDF 만들기", 서버는 조립과 저장만 한다).
//
// 모델 호출 단계: 1, 3, 4, 5, 6, 7. 앱 계산 단계: 2, 8.
// 단계별 산출물이 저장되는 growth_reports 컬럼:
//   1 signals.byActivity / 2 signals.classification / 3 narrative_theme, grade_subthemes, stage,
//   sections(1-8) / 4 signals.match, sections(1-2, 1-6, 1-7, 1-11) / 5 consistency, sections(1-9, 1-10)
//   / 6 axis_scores, sections(2-1~2-10) / 7 sections(3-2~3-7, 3-11~3-13), step_state.planDraft
//   / 8 sections 전체 확정, status completed, growth_plan_items insert.

import type { AxisEvaluation } from "../axes.js";
import type { ConsistencyResult } from "../consistency.js";
import type { Narrative, SectionItem } from "../sections.js";
import type { PlanPeriod, PlanPriority } from "../tracks.js";
import type { Axis, HighGrade, SemesterKey, Track } from "../types.js";
import type { ValidationIssue } from "../validation.js";

export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const STEP_NUMBERS: readonly StepNumber[] = [1, 2, 3, 4, 5, 6, 7, 8];

/** 진행 표시 라벨(No.75). 8은 화면 라벨 그대로 둔다. */
export const STEP_LABELS: Record<StepNumber, string> = {
  1: "활동 읽기",
  2: "학년, 과목, 영역별 분류",
  3: "반복 주제와 흐름 찾기",
  4: "학생 조사 응답 대조",
  5: "방향 일관성 계산",
  6: "A~E 5축 진단",
  7: "학년별 방향 설계",
  8: "PDF 만들기",
};

// ---------------------------------------------------------------------------
// 입력 컨텍스트(회차 고정분 + 조회 결과). DB 행을 받아 context.ts 가 조립한다.
// ---------------------------------------------------------------------------

/** 분석 재료 활동 1건. activity_records 행에서 필요한 것만 평탄화한다. */
export type ContextActivity = {
  id: string;
  sourceProgram: "performance" | "deep" | "self" | "manual" | "upload";
  gradeLabel: HighGrade | null;
  semester: 1 | 2 | null;
  /** 교과 활동이면 과목군, 창체면 창체 접두 라벨, 없으면 null. */
  subjectGroup: string | null;
  subject: string | null;
  topic: string | null;
  /** 모델에 보여줄 본문. 주제, 개념, 결과, 한계, 소감 등을 한 덩어리 문자열로 합친 것. */
  text: string;
  /** 교과(curricular) / 창체(extracurricular) / 미분류. */
  group: "curricular" | "extracurricular" | "unclassified";
};

export type ContextGradeSemester = {
  key: SemesterKey;
  average: number | null;
  source: "direct" | "goal" | null;
};

export type ContextUniversity = {
  universityName: string;
  departmentName: string | null;
  /** admission_results 에서 찾은 최근 2개년 컷(등급 평균). 없으면 빈 배열. */
  cuts: { year: number; grade: number | null }[];
};

export type ReportContext = {
  reportId: string;
  profileId: string;
  track: Track;
  /** 트랙에서 정한 현재 학년. 졸업, N수는 고3 취급. */
  currentGrade: HighGrade;
  /** 분석 범위 학기와 설명(tracks.analysisRange). */
  range: { semesters: SemesterKey[]; description: string };
  /** 트랙별 제외 항목(tracks.omittedSections). */
  omitted: { ids: string[]; reasons: string[] };
  /** 최종 리포트가 가져야 할 섹션 id 목록(sections.expectedSectionIds). */
  expectedSectionIds: string[];
  /** 1학년 자료 없음 플래그(고2 이상에서 1학년 활동 0건). */
  noFirstYearData: boolean;
  activities: ContextActivity[];
  /** 근거로 허용되는 id 목록 = activities 의 id. */
  evidenceIds: string[];
  /** 설문 답(문항 key 와 값). 없으면 빈 객체. */
  survey: Record<string, unknown>;
  profile: {
    schoolType: string | null;
    grade: HighGrade | null;
    semester: 1 | 2 | null;
    career: string | null;
    admissionYear: number | null;
  };
  grades: {
    system: "five" | "nine" | null;
    semesters: ContextGradeSemester[];
    note: string | null;
  };
  universities: ContextUniversity[];
  /** 이전 완료 회차의 서사(진로 변경 감지와 previous 표기용). 없으면 null. */
  previousNarrative: {
    theme: string;
    issuedAt: string;
    career: string | null;
  } | null;
  nowIso: string;
};

// ---------------------------------------------------------------------------
// 단계 산출물
// ---------------------------------------------------------------------------

/** 1단계: 활동별 신호. 모델이 축과 키워드를 달고, 연계 표현은 앱(linkagePhrases)이 단다. */
export type ActivitySignal = {
  activityId: string;
  axes: Axis[];
  /** 탐구 방식 한 단어(예: 자료 분석, 실험, 토론, 독서, 제작). */
  method: string | null;
  /** 반복 문제의식 후보 키워드. */
  keywords: string[];
  /** 앱이 단 연계 표현 신호(linkagePhrases.detectLinkage). */
  linkage: ("subject_link" | "grade_link")[];
  /** 한 줄 요약(모델). */
  summary: string;
};

/** 2단계: 앱 분류 결과. */
export type Classification = {
  byGrade: { grade: HighGrade; count: number }[];
  bySemester: { key: SemesterKey; count: number }[];
  bySubjectGroup: { subjectGroup: string; count: number }[];
  byGroup: {
    curricular: number;
    extracurricular: number;
    unclassified: number;
  };
  /** 분석 범위 밖이라 제외된 활동 id(범위 학기 밖). */
  outOfRangeIds: string[];
};

/** 4단계: 조사 응답 대조. 맞는 신호와 어긋나는 신호(No.57). */
export type MatchSignals = {
  aligned: { text: string; evidenceIds: string[] }[];
  conflicting: { text: string; evidenceIds: string[] }[];
};

/** 7단계 실행계획 초안 항목. growth_plan_items 컬럼과 1:1. */
export type PlanItemDraft = {
  program: "school" | "self" | "deep";
  title: string;
  description: string | null;
  priority: PlanPriority;
  axis: Axis | null;
  category: string | null;
  period: PlanPeriod;
  periodLabel: string | null;
  /** 마감일(YYYY-MM-DD). 과목 선택 시기 외에는 null. 학교 데이터가 없어 1차는 항상 null. */
  deadline: string | null;
};

/** 모델 단계 응답을 앱이 정규화한 결과. 단계마다 쓰는 필드만 채운다. */
export type StepOutput = {
  step: StepNumber;
  signals?: ActivitySignal[];
  classification?: Classification;
  narrative?: Narrative;
  match?: MatchSignals;
  consistency?: ConsistencyResult;
  axes?: AxisEvaluation[];
  /** 이 단계가 만든 섹션 항목(부분). 8단계에서 전체가 모인다. */
  sections?: SectionItem[];
  planDraft?: PlanItemDraft[];
};

// ---------------------------------------------------------------------------
// 단계 상태(growth_reports.step_state jsonb)
// ---------------------------------------------------------------------------

export type StepStatus = "pending" | "running" | "ok" | "failed";

export type StepRecord = {
  status: StepStatus;
  /** 모델 호출 횟수 누계(성공과 실패 합산, No.89). 앱 계산 단계는 요청 횟수. */
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
  /** 마지막 실패의 검증 문제 목록. 성공하면 비운다. */
  issues: ValidationIssue[];
};

export type StepState = {
  steps: Partial<Record<StepNumber, StepRecord>>;
  /** 7단계 산출 실행계획 초안. 8단계가 읽어 growth_plan_items 로 옮긴다. */
  planDraft?: PlanItemDraft[];
  /** 종결 실패. 시도 상한 초과 등으로 회차를 더 진행할 수 없을 때. */
  terminal?: { reason: string; at: string; step: StepNumber };
};

/** 선점 RPC(fn_growth_claim_step) 반환. */
export type ClaimResult =
  | { kind: "claimed"; attempts: number }
  /** 이미 성공한 단계를 다시 요청. 저장분을 그대로 돌려준다(멱등). */
  | { kind: "done" }
  /** 회차가 draft/in_progress 가 아니거나 다른 사용자. */
  | { kind: "locked" }
  /** 앞 단계가 아직 ok 가 아니다. */
  | { kind: "order"; currentStep: number }
  /** 같은 단계가 지금 실행 중(선점 시각이 신선함). */
  | { kind: "running" }
  /** 시도 상한 초과. */
  | { kind: "exhausted"; attempts: number };

/** 선점이 신선하다고 보는 시간. 함수 maxDuration(60초) 보다 길게 잡는다. */
export const CLAIM_STALE_SECONDS = 120;

/** 단계 하나의 전체 시간 예산(ms). 수집 extract 와 같은 50초. */
export const STEP_BUDGET_MS = 50_000;
