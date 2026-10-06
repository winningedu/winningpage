// 보고서 작성 화면의 순수 로직(절 행, 더티 판정, 자동 저장 주기, 저장 문구, 제출 전 검사, 평가 호출 분기).
// 글자 수와 평가 전 검사는 서버와 같은 규칙의 사본 src/lib/inquiry/submission.ts 를 쓴다.
import {
  type CallOutcome,
  classifyCall,
} from "@/components/inquiry/topics/topicsLogic";
import type { ApiResult } from "@/lib/inquiry/api";
import {
  checkSubmissionForEvaluation,
  countChars,
  SECTIONS,
  type SectionMeta,
  shortageOf,
} from "@/lib/inquiry/submission";
import type {
  SectionId,
  SubmissionSections,
  SubmissionView,
} from "@/lib/inquiry/types";

/** 자동 저장 주기(No.75). */
export const AUTOSAVE_MS = 60_000;

/** 평가 호출 중 진행 문구(부록 C). */
export const EVALUATE_LINES = [
  "설계 리포트와 작성본을 나란히 놓는 중",
  "항목마다 요건 4개를 확인하는 중",
  "먼저 고칠 것을 고르는 중",
] as const;

const EMPTY_SECTIONS = (): SubmissionSections => ({
  I: "",
  II: "",
  III: "",
  IV: "",
  V: "",
  VI: "",
  VII: "",
  VIII: "",
});

/** 재진입 때 상세의 작성본(draft 우선)으로 8절을 복원한다(No.75). */
export function initialSections(
  submission: Pick<SubmissionView, "sections"> | null,
): SubmissionSections {
  return submission ? { ...submission.sections } : EMPTY_SECTIONS();
}

export type SectionRow = SectionMeta & {
  count: number;
  counter: string;
  /** 권장 대비 부족한 글자 수. 권장이 없으면 null. */
  shortage: number | null;
  short: boolean;
};

export function buildSectionRows(sections: SubmissionSections): SectionRow[] {
  const counts = countChars(sections);
  return SECTIONS.map((meta) => {
    const count = counts[meta.id];
    const shortage = shortageOf(meta.id, count);
    return {
      ...meta,
      count,
      counter:
        meta.recommendedChars === null
          ? `${count}자 / 분량 제한 없음`
          : `${count}자 / 권장 ${meta.recommendedChars}자 이상`,
      shortage,
      short: shortage !== null && shortage > 0,
    };
  });
}

/** 마지막 저장분과 다른지. 저장분이 없으면 모두 빈 절일 때만 더티가 아니다. */
export function isDirty(
  current: SubmissionSections,
  saved: SubmissionSections | null,
): boolean {
  const base = saved ?? EMPTY_SECTIONS();
  return SECTIONS.some((s) => current[s.id] !== base[s.id]);
}

export function shouldAutosave(input: {
  dirty: boolean;
  busy: boolean;
}): boolean {
  return input.dirty && !input.busy;
}

export function formatSavedTime(at: Date): string {
  const hh = String(at.getHours()).padStart(2, "0");
  const mm = String(at.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function saveStatusText(input: {
  savedAt: Date | null;
  justSaved: boolean;
}): string {
  const base = "60초마다 자동 저장돼요";
  if (!input.savedAt) return base;
  const time = formatSavedTime(input.savedAt);
  return input.justSaved
    ? `자동 저장됨. 마지막 저장 ${time}`
    : `${base}. 마지막 저장 ${time}`;
}

// ── 제출 전 검사(서버와 같은 규칙, 모델 호출 없음) ─────────────────────────

export type Precheck =
  | { kind: "ok"; placeholders: Partial<Record<SectionId, number>> }
  | { kind: "empty"; sections: SectionId[] }
  | { kind: "tooShort"; total: number };

export function precheck(sections: SubmissionSections): Precheck {
  const check = checkSubmissionForEvaluation(sections);
  if (check.ok) return { kind: "ok", placeholders: check.placeholders };
  if (check.code === "SECTION_EMPTY") {
    return { kind: "empty", sections: check.sections };
  }
  return { kind: "tooShort", total: check.total };
}

function numeralOf(id: SectionId): string {
  return SECTIONS.find((s) => s.id === id)?.numeral ?? id;
}

export function emptyMessage(ids: SectionId[]): string {
  return `${ids.map(numeralOf).join(", ")}절이 비어 있어요. 8절을 모두 채워야 평가를 받을 수 있어요.`;
}

export function tooShortMessage(): string {
  return "Ⅰ~Ⅶ절 합계 300자 미만이라 평가를 실행하지 않았어요. 이용 횟수는 차감되지 않았어요.";
}

/** 절별 자리표시자 개수 한 줄(No.78). 예: "Ⅲ절 2곳, Ⅳ절 1곳". */
export function placeholderSummary(
  placeholders: Partial<Record<SectionId, number>>,
): string {
  return SECTIONS.flatMap((s) => {
    const n = placeholders[s.id];
    return n ? [`${s.numeral}절 ${n}곳`] : [];
  }).join(", ");
}

// ── 평가 호출 결과 분기 ───────────────────────────────────────────────────

export type EvaluateOutcome =
  | CallOutcome
  | { type: "sectionEmpty" }
  | { type: "tooShort" }
  | { type: "reevaluationLimit" };

/** evaluate-report 응답을 화면 분기로 바꾼다. 생성 공통 분기는 classifyCall 을 따른다. */
export function classifyEvaluate(
  result: ApiResult<unknown>,
  runningRetries: number,
): EvaluateOutcome {
  if (result.kind === "error") {
    if (result.code === "SECTION_EMPTY") return { type: "sectionEmpty" };
    if (result.code === "SUBMISSION_TOO_SHORT") return { type: "tooShort" };
    if (result.code === "REEVALUATION_LIMIT") {
      return { type: "reevaluationLimit" };
    }
  }
  return classifyCall(result, runningRetries);
}
