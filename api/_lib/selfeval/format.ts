// 형식 6항목(명세 No.56). 전부 서버 결정론이라 모델 판정과 섞이지 않는다.
// detail 은 시안 하단 형식 카드처럼 실제 수치를 넣은 한 문장으로 쓴다.

import {
  clicheDensity,
  containsUniversity,
  countByMode,
  countSentences,
} from "./text.js";
import {
  CLICHE_DENSITY_MAX,
  type FormatCheck,
  MIN_LENGTH_CHARS,
  MIN_SENTENCES,
  type Sentence,
  TARGET_TOLERANCE,
  type TargetCharsMode,
} from "./types.js";

export type FormatInput = {
  text: string;
  targetChars: number | null;
  mode: TargetCharsMode;
  universities: string[];
  sentences: Sentence[];
};

const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));

export function runFormatChecks(input: FormatInput): FormatCheck[] {
  const { text, targetChars, mode, universities, sentences } = input;
  const len = countByMode(text, mode);
  const modeLabel = mode === "with_space" ? "공백 포함" : "공백 제외";
  const checks: FormatCheck[] = [];

  // 1. 목표 글자 수. 비어 있으면 이 항목만 끄고 나머지는 그대로 진행한다.
  if (targetChars === null) {
    checks.push({
      key: "target_range",
      label: "목표 글자 수 대비 오차 5% 이내",
      pass: true,
      detail: "목표 글자 수를 비워 분량 판정을 껐어요",
      skipped: true,
    });
  } else {
    const diff = len - targetChars;
    checks.push({
      key: "target_range",
      label: "목표 글자 수 대비 오차 5% 이내",
      pass: Math.abs(diff) <= targetChars * TARGET_TOLERANCE,
      detail: `${modeLabel} ${len}자, 목표 ${targetChars}자, 차이 ${signed(diff)}자예요`,
      skipped: false,
    });
  }

  // 2. 상투어 밀도
  const cliche = clicheDensity(text, mode);
  checks.push({
    key: "cliche_density",
    label: "상투어 밀도 1,000자당 2.0회 미만",
    pass: cliche.density < CLICHE_DENSITY_MAX,
    detail: `1,000자당 ${cliche.density.toFixed(1)}회예요. 기준은 ${CLICHE_DENSITY_MAX.toFixed(1)}회 미만이에요`,
    skipped: false,
  });

  // 3. 최소 분량. 목표가 400 미만이면 짧은 글을 요구받은 것이라 목표의 80% 로 낮춘다.
  const lowTarget = targetChars !== null && targetChars < MIN_LENGTH_CHARS;
  const minChars = lowTarget ? Math.round(targetChars * 0.8) : MIN_LENGTH_CHARS;
  checks.push({
    key: "min_length",
    label: `${minChars}자 이상`,
    pass: len >= minChars,
    detail: lowTarget
      ? `목표가 ${MIN_LENGTH_CHARS}자 미만이라 목표의 80%인 ${minChars}자를 기준으로 했어요. 지금은 ${len}자예요`
      : `기준 ${minChars}자, 지금은 ${len}자예요`,
    skipped: false,
  });

  // 4. 최소 문장 수
  const sentenceCount = countSentences(text);
  checks.push({
    key: "min_sentences",
    label: `${MIN_SENTENCES}문장 이상`,
    pass: sentenceCount >= MIN_SENTENCES,
    detail: `${sentenceCount}문장이에요. 기준은 ${MIN_SENTENCES}문장 이상이에요`,
    skipped: false,
  });

  // 5. 대학 이름 금지
  const university = containsUniversity(text, universities);
  checks.push({
    key: "no_university",
    label: "대학 이름이 들어가지 않았다",
    pass: university === null,
    detail:
      university === null
        ? "완성 문장에 대학 이름은 넣지 않아요. 들어간 곳이 없어요"
        : `본문에 ${university} 이름이 들어 있어요. 완성 문장에 대학 이름은 넣지 않아요`,
    skipped: false,
  });

  // 6. 확인하지 않은 느낌 문장
  const pending = sentences.filter((s) => s.feeling && !s.confirmed).length;
  checks.push({
    key: "no_pending_feelings",
    label: "확인 필요 표시가 남아 있지 않다",
    pass: pending === 0,
    detail:
      pending === 0
        ? "확인이 필요한 문장이 남아 있지 않아요"
        : `확인이 필요한 문장이 ${pending}개 남아 있어요. 노란 표시는 학생이 확인해야 해요`,
    skipped: false,
  });

  return checks;
}
