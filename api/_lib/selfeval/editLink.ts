// 학생이 본문을 고쳤을 때 문장 근거 연결을 다시 맞춘다(명세 No.50, §2 18).
// 문장 id 와 evidence 는 생성 때 서버가 붙인 것이라, 고친 문장에 옛 근거를 그대로 두면
// 검증과 표시가 거짓 근거를 가리킨다. 그래서 글자가 같은 문장만 연결을 유지한다.

import {
  type EvidenceSources,
  resolveSentenceEvidence,
  studentEvidence,
} from "./evidence.js";
import { ensureTerminalPunctuation, splitSentences } from "./text.js";
import type { GenerationSections, Paragraph, Sentence } from "./types.js";

const stripSpaces = (v: string): string => v.replace(/\s+/g, "");

export function paragraphTexts(sections: GenerationSections): string[] {
  return sections.paragraphs.map((p) =>
    p.sentences.map((s) => s.text).join(" "),
  );
}

/** 문단은 빈 줄, 문장은 공백으로 잇는다. 글자 수 계산과 화면 복사의 기준 본문이다. */
export function plainText(sections: GenerationSections): string {
  return paragraphTexts(sections).join("\n\n");
}

export type RelinkResult =
  | { ok: true; sections: GenerationSections }
  | { ok: false; code: "PARAGRAPH_COUNT"; message: string };

/**
 * 고친 문단 글을 문장으로 나눠 이전 문장과 공백 무시로 비교한다.
 * 같은 문장은 id, evidence, feeling, confirmed 를 유지하고, 바뀌거나 새로 생긴 문장은
 * 학생이 쓴 것으로 보아 evidence [S 학생 입력], feeling false 로 둔다. 학생이 직접 쓴
 * 문장에 서버가 느낌 표시를 붙이면 자기 글을 확인하라고 요구하게 되기 때문이다.
 * 문단 수는 고정하지 않는다(명세 No.44). 문장은 문단을 옮겨도 연결을 유지하고, 같은 자리에
 * 옛 role 이 있는 옛 리포트는 그 role 을 그대로 둔다.
 */
export function relinkEdited(
  previous: GenerationSections,
  editedParagraphs: string[],
): RelinkResult {
  if (editedParagraphs.length < 1) {
    return {
      ok: false,
      code: "PARAGRAPH_COUNT",
      message: "문단은 1개 이상이어야 합니다.",
    };
  }
  const pool = new Map<string, Sentence[]>();
  for (const s of previous.paragraphs.flatMap((p) => p.sentences)) {
    const key = stripSpaces(s.text);
    pool.set(key, [...(pool.get(key) ?? []), s]);
  }
  const paragraphs = editedParagraphs.map((edited, pi): Paragraph => {
    const sentences = splitSentences(edited).map((piece, si): Sentence => {
      const text = ensureTerminalPunctuation(piece);
      const kept = pool.get(stripSpaces(text))?.shift();
      if (kept) return { ...kept, text };
      return {
        id: `p${pi + 1}-e${si + 1}`,
        text,
        evidence: [studentEvidence()],
        feeling: false,
        confirmed: false,
      };
    });
    const role = previous.paragraphs[pi]?.role;
    return role === undefined ? { sentences } : { role, sentences };
  });
  return { ok: true, sections: { paragraphs } };
}

/**
 * 학생이 한 문장의 근거 기록을 다시 고른다(명세 No.147). 고른 것 중 이번 세션의 선택 기록과
 * 포함된 수기 메모만 남기고 서버가 출처 유형을 붙인다. 하나도 남지 않으면 학생 입력(S)으로 둔다.
 * 확인 필요 표시는 근거 규칙으로 다시 정한다. 없는 문장 id 면 null.
 */
export function repickEvidence(
  sections: GenerationSections,
  sentenceId: string,
  picks: { refId: string; item: string }[],
  sources: EvidenceSources,
): GenerationSections | null {
  if (
    !sections.paragraphs.some((p) =>
      p.sentences.some((s) => s.id === sentenceId),
    )
  ) {
    return null;
  }
  return {
    paragraphs: sections.paragraphs.map((p) => ({
      ...p,
      sentences: p.sentences.map((s): Sentence => {
        if (s.id !== sentenceId) return s;
        const picked = resolveSentenceEvidence(
          picks.map((x) => ({ ...x, weight: "main" })),
          s.text,
          sources,
        );
        return picked.evidence.length === 0
          ? { ...s, evidence: [studentEvidence()], feeling: false }
          : {
              ...s,
              evidence: picked.evidence,
              feeling: picked.needsConfirmation,
            };
      }),
    })),
  };
}

/** 학생이 느낌 문장을 확인했다고 표시한다. 없는 id 는 그대로 둔다. */
export function confirmFeeling(
  sections: GenerationSections,
  sentenceId: string,
): GenerationSections {
  return {
    paragraphs: sections.paragraphs.map((p) => ({
      ...p,
      sentences: p.sentences.map((s) =>
        s.id === sentenceId ? { ...s, confirmed: true } : s,
      ),
    })),
  };
}
