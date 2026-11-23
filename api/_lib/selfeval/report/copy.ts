// 리포트 코드 문구. 샘플 PDF 의 가운뎃점과 긴 줄표는 저장소 규칙에 따라 쉼표와 낱말로 바꿨다.

import type {
  ReportNextStepKey,
  ReportRole,
  ReportUnreflectedReason,
} from "../../../../src/lib/selfeval/reportTypes.js";

export const ROLE_LABELS: Record<ReportRole, string> = {
  core: "핵심 근거",
  main: "주요 근거",
  reflection: "성찰 근거 (교과 연계)",
  support: "보조 근거 (교과 연계)",
  indirect: "간접 근거 (교과 연계)",
  in_progress: "진행 중, 반영 안 함",
  unreflected: "미반영",
};

export const REASON_LABELS: Record<ReportUnreflectedReason, string> = {
  unrelated: "문항과 관련 없음",
  other_subject: "다른 과목 소재",
  deselected: "학생이 해제",
  plan: "계획 상태",
};

export const RELATION_LABELS = {
  inherit: "계승",
  deepen: "심화",
  complement: "보완",
} as const;

export const STRENGTH_LABELS = {
  explicit: "기록에 명시",
  implicit: "학생 확인",
} as const;

export const RECORD_KIND_LABELS = {
  performance: "수행",
  deep: "심화",
  activity: "활동",
} as const;

export const NEXT_STEP_KEYS: readonly ReportNextStepKey[] = [
  "memo_detail",
  "finish_in_progress",
  "verify_action",
  "use_elsewhere",
  "verification_fix",
];

export const NEXT_STEP_MAX = 4;

export const CARD_NONE_TEXT = "이용 기록 없음";
export const CARD_ERROR_TEXT = "불러오지 못함";

export const CHAPTER_TITLES = {
  ch01: "자기평가 본문",
  ch02: "과목별 수행, 심화 활동",
  ch03: "기 제출 보고서와의 연관성",
  ch04: "수기 수행보고 연관성",
  ch05: "성장 흐름과 다음 단계",
} as const;

export const NOT_APPLICABLE_TEXT = "해당 없음";

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

/** 문장 번호 글리프. 20을 넘으면 괄호 숫자로 쓴다. */
export function circled(n: number): string {
  return n >= 1 && n <= 20 ? (CIRCLED[n - 1] as string) : `(${n})`;
}

export function circledList(numbers: number[]): string {
  return numbers.map(circled).join("");
}

export function subjectTitle(subject: string): string {
  return `${subject} 자기평가서`;
}

export function memoRateTemplate(
  total: number,
  k: number,
  numbers: number[],
): string {
  return `수기 메모가 자기평가 ${total}문장 중 ${k}문장(${circledList(numbers)})의 근거가 됐습니다`;
}

export function completionText(total: number, linked: number): string {
  return `${total}문장 중 ${linked}문장${
    linked === total ? " 모두 근거 연결 완료" : " 근거 연결"
  }`;
}

export function recommendText(subject: string): string {
  return `${subject} 자기평가 추천`;
}
