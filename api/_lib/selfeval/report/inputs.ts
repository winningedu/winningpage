// 리포트 조립 입력(명세 No.133~173). DB 행을 읽는 load.ts 가 이 모양으로 만들고, 순수 함수들이 읽는다.

import type {
  ReportServiceTier,
  ReportStepKey,
  ReportTagMap,
} from "../../../../src/lib/selfeval/reportTypes.js";

export type RecordStatus = "completed" | "in_progress" | "plan";

export type EntryKind = "performance" | "deep" | "activity";

export type ReportRecord = {
  id: string;
  sourceProgram: "performance" | "deep" | "manual";
  entryKind: EntryKind | null;
  subject: string | null;
  courseName: string | null;
  topic: string | null;
  concept: string | null;
  method: string | null;
  result: string | null;
  limitation: string | null;
  numbers: unknown;
  sources: unknown;
  summary: string | null;
  reflection: string | null;
  recordStatus: RecordStatus;
  /** submitted_at ?? created_at */
  submittedAt: string;
  parentRecordId: string | null;
  /** 세션에서 고른 역할. 고르지 않았으면 null. */
  selectedRole: "core" | "support" | null;
};

export type ReportMemo = {
  id: string;
  /** yyyy-mm-dd */
  writtenAt: string;
  text: string;
};

export type LinkType =
  | "inherit"
  | "deepen"
  | "borrow_method"
  | "complement"
  | "background"
  | "area_extend"
  | "grade_continue";

export type ReportLink = {
  fromRecordId: string;
  toRecordId: string;
  linkType: LinkType;
  strength: "explicit" | "implicit";
};

export type SessionFacts = {
  academicYear: number;
  area: "subject" | "autonomy" | "club" | "career" | null;
  subject: string | null;
  activityName: string | null;
  gradeLabel: "고1" | "고2" | "고3" | null;
  targetChars: number | null;
  targetCharsMode: "with_space" | "without_space";
};

/** 카드 한 장의 재료. error 면 읽기에 실패한 것이다(No.202). */
export type StageSource<T> =
  | { state: "ok"; value: T }
  | { state: "none" }
  | { state: "error" };

export type StageInputs = {
  /** 학습진단 최신 완료 결과의 학생용 요약 문장과 진단일(yyyy.mm.dd). */
  diagnosis: StageSource<{ sentence: string; date: string }>;
  /** 목표관리 문장. */
  goal: StageSource<{ sentence: string }>;
  /** 성장설계 한 줄. */
  growth: StageSource<{ sentence: string }>;
};

export type BuildInput = {
  session: SessionFacts;
  /** 최종본 sections 원문. 옛 모양이 섞여 있을 수 있다. */
  bodySections: unknown;
  charCount: { withSpace: number; withoutSpace: number };
  /** 최종 저장 시각(ISO). */
  savedAt: string;
  serviceTier: ReportServiceTier | null;
  /** 표시 전 학년 원문(고1 등). */
  profileGrade: string | null;
  records: ReportRecord[];
  memos: ReportMemo[];
  links: ReportLink[];
  /** 자기평가서를 이미 저장한 과목(이번 세션 포함). */
  completedSubjects: string[];
  steps: Record<ReportStepKey, boolean>;
  stages: StageInputs;
  /** 검증의 고치면 좋은 곳 상위 항목 문장. 없으면 null. */
  topImprovement: string | null;
  /** 처음 만들 때 고정된 꼬리표. 없으면 새로 매긴다. */
  tagMap: ReportTagMap | null;
};
