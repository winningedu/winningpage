// 확정 화면 순수 함수: 6항목 표 행, 7항목 폼 상태, 제출 판정과 제출 바디.
import { SUBMISSION_LABELS } from "@/lib/inquiry/labels";
import type { ActivityFields, FinalizePreview } from "@/lib/inquiry/types";

export type SummaryRow = {
  key: string;
  label: string;
  value: string;
  badge?: string;
  /** 값이 비어 빨간 글씨로 보여야 할 때. */
  error?: boolean;
};

const LIMITATION_MISSING = "추출하지 못했어요. Ⅵ 한계 절이 비어 있어요";

export function buildSummaryRows(preview: FinalizePreview): SummaryRow[] {
  const s = preview.summary;
  const limitationEmpty = s.limitation.trim() === "";
  const rows: SummaryRow[] = [
    { key: "topic", label: "주제", value: s.topic },
    { key: "area", label: "영역", value: `교과, ${s.subject}` },
    { key: "linkage", label: "연계", value: s.linkage },
    { key: "concepts", label: "사용 개념", value: s.concepts.join(", ") },
    {
      key: "limitation",
      label: "이번에 남은 한계",
      value: limitationEmpty ? LIMITATION_MISSING : s.limitation,
      error: limitationEmpty,
    },
    {
      key: "score",
      label: "평가 점수",
      value: `내부 기준 ${s.score}점`,
      badge: SUBMISSION_LABELS[s.label],
    },
  ];
  if (s.planItemTitle) {
    rows.push({
      key: "reply",
      label: "성장설계 회신",
      value: `실행계획 과제 '${s.planItemTitle}': 확정하면 완료로 알려요`,
    });
  }
  return rows;
}

export const TEXT_KEYS = [
  "topic",
  "concept",
  "method",
  "result",
  "limitation",
] as const;
export type TextKey = (typeof TEXT_KEYS)[number];

/** 폼 상태. 수치와 자료명은 줄 단위 입력 한 덩어리로 들고 있다. */
export type FormState = Record<TextKey, string> & {
  numbers: string;
  sources: string;
};

export function initFormState(preview: FinalizePreview): FormState {
  const f = preview.fields;
  return {
    topic: f.topic,
    concept: f.concept,
    method: f.method,
    result: f.result,
    limitation: f.limitation,
    numbers: f.numbers.join("\n"),
    sources: f.sources.join("\n"),
  };
}

export function blankTextKeys(form: FormState): TextKey[] {
  return TEXT_KEYS.filter((k) => form[k].trim() === "");
}

export function canSubmit(form: FormState): boolean {
  return blankTextKeys(form).length === 0;
}

function toLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

export function toRequestFields(form: FormState): ActivityFields {
  return {
    topic: form.topic.trim(),
    concept: form.concept.trim(),
    method: form.method.trim(),
    result: form.result.trim(),
    limitation: form.limitation.trim(),
    numbers: toLines(form.numbers),
    sources: toLines(form.sources),
  };
}

const FIELD_NAMES: Record<string, string> = {
  topic: "주제",
  concept: "사용 개념",
  method: "방법",
  result: "결과",
  limitation: "한계",
  numbers: "수치",
  sources: "자료명",
};

/** 서버 400 의 extra.missing 을 화면 이름으로 바꾼다. 알 수 없는 값은 버린다. */
export function missingLabels(missing: unknown): string[] {
  if (!Array.isArray(missing)) return [];
  const names: string[] = [];
  for (const k of missing) {
    const name = typeof k === "string" ? FIELD_NAMES[k] : undefined;
    if (name) names.push(name);
  }
  return names;
}
