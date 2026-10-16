// 학년 단계와 연계 유형 적합도(명세 No.44~47, 110). 순수 함수만 둔다.
import {
  GRADE_NOTES,
  STAGE_BY_GRADE,
  STAGE_LABELS,
  STAGE_LINK_RULES,
} from "./constants.js";
import type { Fit, GradeLabel, LinkKind, Stage } from "./types.js";

export function stageOf(grade: GradeLabel): Stage {
  return STAGE_BY_GRADE[grade];
}

/** 권장이면 match, 비권장이면 off, 표에 없으면 neutral(No.45, 110). */
export function fitFor(grade: GradeLabel, linkKind: LinkKind): Fit {
  const rule = STAGE_LINK_RULES[grade];
  if (rule.recommended.includes(linkKind)) return "match";
  if (rule.discouraged.includes(linkKind)) return "off";
  return "neutral";
}

const FIT_ORDER: Record<Fit, number> = { match: 0, neutral: 1, off: 2 };

/** 권장 먼저(No.45). 같은 적합도는 입력 순서를 지키고 원본은 바꾸지 않는다. */
export function sortTopicsByFit<T extends { fit: Fit }>(topics: T[]): T[] {
  return topics
    .map((topic, index) => ({ topic, index }))
    .sort(
      (a, b) =>
        FIT_ORDER[a.topic.fit] - FIT_ORDER[b.topic.fit] || a.index - b.index,
    )
    .map((entry) => entry.topic);
}

/** 학년별 정적 안내(No.46, 47). 없으면 null. */
export function gradeNote(grade: GradeLabel): string | null {
  return GRADE_NOTES[grade] ?? null;
}

export function stageLabel(stage: Stage): string {
  return STAGE_LABELS[stage];
}
