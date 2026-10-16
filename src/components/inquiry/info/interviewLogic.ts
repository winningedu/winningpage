// 기억으로 되살리기(7문항) 패널의 순수 로직(No.33~35). 빈틈 후보 규칙은 src/lib/inquiry/gaps.ts 에 있다.

import { validateInterview } from "@/lib/inquiry/gaps";
import type {
  GapCandidate,
  InterviewAnswers,
  InterviewEnding,
  InterviewSourceType,
  InterviewTaskType,
} from "@/lib/inquiry/types";
import { interviewAsset, type LocalAsset } from "./infoLogic";

export const INTERVIEW_QUESTIONS = [
  "어떤 활동이었나요 (주제 한 줄, 필수)",
  "무엇을 하라는 과제였나요",
  "자료는 주로 어디서 가져왔나요 (여러 개 선택)",
  "남이 만든 기준, 지표, 공식, 데이터를 그대로 가져다 쓴 것이 있나요",
  "마무리를 어떻게 했나요",
  "시간이 더 있었으면 무엇을 더 했을 것 같나요",
  "선생님 피드백이나 아쉬웠던 점이 있나요",
] as const;

export const TASK_OPTIONS: { value: InterviewTaskType; label: string }[] = [
  { value: "survey", label: "조사와 정리" },
  { value: "experiment", label: "실험과 측정" },
  { value: "analysis", label: "자료 분석과 계산" },
  { value: "review", label: "감상과 비평" },
  { value: "presentation", label: "발표와 토론" },
  { value: "making", label: "제작과 설계" },
];

export const SOURCE_OPTIONS: { value: InterviewSourceType; label: string }[] = [
  { value: "textbook", label: "교과서" },
  { value: "internet", label: "인터넷 검색" },
  { value: "paper", label: "논문" },
  { value: "measurement", label: "직접 측정" },
  { value: "statistics", label: "기관 통계" },
];

export const ENDING_OPTIONS: { value: InterviewEnding; label: string }[] = [
  { value: "summary", label: "정리하고 끝냄" },
  { value: "claim", label: "주장을 세움" },
];

export function toggleSource(
  list: InterviewSourceType[],
  value: InterviewSourceType,
): InterviewSourceType[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

function labelOf<T extends string>(
  options: { value: T; label: string }[],
  value: T,
): string | null {
  return options.find((option) => option.value === value)?.label ?? null;
}

/** 후보 아래에 보이는 근거 문장. 3번과 5번은 고른 답을 괄호로 붙인다. */
export function candidateOrigin(
  candidate: GapCandidate,
  answers: InterviewAnswers,
): string {
  const head = `${candidate.source}번 답변`;
  let detail: string | null = null;
  if (candidate.source === 3) {
    const labels = (answers.q3 ?? [])
      .map((v) => labelOf(SOURCE_OPTIONS, v))
      .filter((v): v is string => v !== null);
    detail = labels.length > 0 ? labels.join(", ") : null;
  } else if (candidate.source === 5 && answers.q5) {
    detail = labelOf(ENDING_OPTIONS, answers.q5);
  }
  return detail ? `${head}(${detail})에서 추정` : `${head}에서 추정`;
}

/** 체크한 후보와 직접 쓴 한 줄을 후보 순서대로 모은다. 체크는 문장으로 들고 있어 답을 고쳐도 어긋나지 않는다. */
export function selectedGaps(
  candidates: GapCandidate[],
  checked: ReadonlySet<string>,
  custom: string,
): string[] {
  const out = candidates.filter((c) => checked.has(c.text)).map((c) => c.text);
  const extra = custom.trim();
  if (extra !== "" && !out.includes(extra)) out.push(extra);
  return out;
}

export type InterviewBuild =
  | { ok: true; asset: LocalAsset }
  | { ok: false; reason: string };

export function buildInterviewAsset(
  answers: InterviewAnswers,
  gaps: string[],
  key: string,
): InterviewBuild {
  const trimmed: InterviewAnswers = { ...answers, q1: answers.q1.trim() };
  const result = validateInterview(trimmed, gaps);
  if (!result.ok) {
    return {
      ok: false,
      reason:
        result.code === "Q1_REQUIRED"
          ? "활동의 주제를 한 줄 적어 주세요."
          : "빈틈을 하나 이상 골라 주세요.",
    };
  }
  return { ok: true, asset: interviewAsset(trimmed, gaps, key) };
}
