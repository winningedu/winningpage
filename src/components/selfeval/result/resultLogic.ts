// 생성 결과 화면의 순수 로직(시안 36~42, 명세 No.46~52, 117~121). 화면은 이 결과만 그린다.
import {
  ANALYSIS_FIELD_LABELS,
  type AnalysisField,
  type CharCount,
  type GenerationSections,
  PARAGRAPH_ROLE_LABELS,
  type Sentence,
  type SessionActivityView,
  TARGET_TOLERANCE,
  type TargetCharsMode,
} from "@/lib/selfeval/types";

export type CharChips = {
  withSpace: number;
  withoutSpace: number;
  /** 목표가 비어 있으면 null(목표 칩을 그리지 않는다). */
  target: { value: number; diff: number; outOfRange: boolean } | null;
};

export function charChips(
  count: CharCount,
  targetChars: number | null,
  mode: TargetCharsMode,
): CharChips {
  const base = { withSpace: count.withSpace, withoutSpace: count.withoutSpace };
  if (targetChars === null || targetChars <= 0)
    return { ...base, target: null };
  const actual = mode === "with_space" ? count.withSpace : count.withoutSpace;
  const diff = actual - targetChars;
  return {
    ...base,
    target: {
      value: targetChars,
      diff,
      outOfRange: Math.abs(diff) / targetChars > TARGET_TOLERANCE,
    },
  };
}

/** 문단 본문. 문장을 공백으로 잇는다(서버 edit 이 문단 문자열을 받는다). */
export function paragraphTexts(sections: GenerationSections): string[] {
  return sections.paragraphs.map((p) =>
    p.sentences.map((x) => x.text).join(" "),
  );
}

/** 학생이 확인해야 하는 느낌 문장(노란 표시). */
export function pendingFeelings(sections: GenerationSections): Sentence[] {
  return sections.paragraphs
    .flatMap((p) => p.sentences)
    .filter((x) => x.feeling && !x.confirmed);
}

/** 한 문장을 뺀 문단 텍스트. 문단 수는 유지한다(서버가 문단 수를 검사한다). */
export function textsWithoutSentence(
  sections: GenerationSections,
  sentenceId: string,
): string[] {
  return sections.paragraphs.map((p) =>
    p.sentences
      .filter((x) => x.id !== sentenceId)
      .map((x) => x.text)
      .join(" "),
  );
}

export type EvidenceView =
  | {
      kind: "activity";
      activityName: string;
      fieldLabel: string;
      /** 기록 원문. 기록에도 분석에도 값이 없으면 null(그 줄을 그리지 않는다). */
      source: string | null;
    }
  | { kind: "student" };

const RECORD_FIELDS = ["concept", "method", "result", "limitation"] as const;

function nonEmpty(value: string | null | undefined): string | null {
  const t = value?.trim() ?? "";
  return t === "" ? null : t;
}

function sourceText(
  activity: SessionActivityView,
  field: AnalysisField,
): string | null {
  const fromRecord = (RECORD_FIELDS as readonly string[]).includes(field)
    ? nonEmpty(activity.record[field as (typeof RECORD_FIELDS)[number]])
    : null;
  return fromRecord ?? nonEmpty(activity.analysis?.values?.[field]);
}

export function evidenceOf(
  sentence: Sentence,
  activities: SessionActivityView[],
): EvidenceView | null {
  const evidence = sentence.evidence;
  if (!evidence) return null;
  if ("student" in evidence) return { kind: "student" };
  const activity = activities.find(
    (a) => a.activityRecordId === evidence.activityId,
  );
  if (!activity) return null;
  return {
    kind: "activity",
    activityName: nonEmpty(activity.record.topic) ?? "자료 없음",
    fieldLabel: ANALYSIS_FIELD_LABELS[evidence.field],
    source: sourceText(activity, evidence.field),
  };
}

export type ParagraphSummary = {
  number: number;
  roleLabel: string;
  activityNames: string[];
};

/** 우측 "문장 근거" 카드. 문단마다 그 문장들이 기댄 활동명을 중복 없이 모은다. */
export function paragraphSummaries(
  sections: GenerationSections,
  activities: SessionActivityView[],
): ParagraphSummary[] {
  return sections.paragraphs.map((p, i) => {
    const names: string[] = [];
    for (const sentence of p.sentences) {
      const view = evidenceOf(sentence, activities);
      if (view?.kind === "activity" && !names.includes(view.activityName)) {
        names.push(view.activityName);
      }
    }
    return {
      number: i + 1,
      roleLabel: PARAGRAPH_ROLE_LABELS[p.role],
      activityNames: names,
    };
  });
}
