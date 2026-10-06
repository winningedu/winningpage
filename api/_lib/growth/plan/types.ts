// 성장설계 실행계획(P5) 공유 계약. 순수 타입만 둔다.
//
// 범위(명세 No.155~164, 계획 §3 P5): 실행계획 조회(시기 묶음, 진행률, 마감, 이월 묶음,
// 피해야 할 반복, 완료 시 변화 예측, 프로그램 이동 전달값), 항목 상태 변경(수동 체크,
// 마감일 입력, 하위 프로그램 확정 수신과 중복 확정 처리), 지표 재계산(저장하지 않고 조회 때
// 리포트 스냅샷 + 완료 항목으로 계산).

import type { PlanPeriod, PlanPriority } from "../tracks.js";
import type { Axis, HighGrade, Track } from "../types.js";

export type PlanProgram = "school" | "self" | "deep";
export type PlanDoneSource = "manual" | "self" | "deep";

/** growth_plan_items 행. 컬럼명 그대로. */
export type PlanItemRow = {
  id: string;
  report_id: string;
  profile_id: string;
  program: PlanProgram;
  title: string;
  description: string | null;
  priority: PlanPriority;
  axis: Axis | null;
  category: string | null;
  period: PlanPeriod;
  period_label: string | null;
  deadline: string | null;
  status: "pending" | "done";
  done_source_program: PlanDoneSource | null;
  done_ref_id: string | null;
  done_at: string | null;
  carried_from_report_id: string | null;
  sort_order: number;
  updated_at: string;
};

/** 실행계획이 딸린 리포트 행에서 필요한 컬럼. */
export type PlanReportRow = {
  id: string;
  profile_id: string;
  status: string;
  track: Track | null;
  narrative_theme: string | null;
  grade_subthemes: unknown;
  stage: string | null;
  consistency: unknown;
  axis_scores: unknown;
  sections: unknown;
  issued_at: string | null;
};

/** 응답용 항목. 마감 상태와 이월 여부를 붙인다. */
export type PlanItemView = {
  id: string;
  program: PlanProgram;
  title: string;
  description: string | null;
  priority: PlanPriority;
  axis: Axis | null;
  category: string | null;
  period: PlanPeriod;
  periodLabel: string | null;
  deadline: string | null;
  dday: number | null;
  urgent: boolean;
  deadlineLabel: string | null;
  done: boolean;
  doneSource: PlanDoneSource | null;
  doneAt: string | null;
  carried: boolean;
  carriedFromReportId: string | null;
  sortOrder: number;
};

export type PlanGroup = {
  period: PlanPeriod;
  label: string;
  items: PlanItemView[];
};

/** 하위 프로그램으로 넘기는 최소 전달값(No.160) + 확장 메타. */
export type ProgramHandoff = {
  reportId: string;
  itemId: string;
  program: PlanProgram;
  theme: string | null;
  currentGrade: HighGrade | null;
  stage: string | null;
  subtheme: string | null;
  condition: {
    title: string;
    description: string | null;
    axis: Axis | null;
    category: string | null;
  };
};

/** PATCH /api/growth/plan/item 액션. */
export type PlanItemAction =
  | { action: "check"; itemId: string; done: boolean }
  | { action: "set-deadline"; itemId: string; deadline: string | null }
  | {
      action: "program-done";
      itemId: string;
      program: "self" | "deep";
      refId: string;
    };
