// 학생이 본문을 고쳤을 때 문장 근거 연결을 다시 맞춘다(명세 No.50, §2 18).
// 문장 id 와 evidence 는 생성 때 서버가 붙인 것이라, 고친 문장에 옛 근거를 그대로 두면
// 검증과 표시가 거짓 근거를 가리킨다. 그래서 글자가 같은 문장만 연결을 유지한다.

import { splitSentences } from "./text.js";
import type { GenerationSections, Sentence } from "./types.js";

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
 * 학생이 쓴 것으로 보아 evidence {student:true}, feeling false 로 둔다. 학생이 직접 쓴
 * 문장에 서버가 느낌 표시를 붙이면 자기 글을 확인하라고 요구하게 되기 때문이다.
 * 문단 수는 바꿀 수 없다. 문단 role 이 구조 검증의 기준이라서다.
 */
export function relinkEdited(
  previous: GenerationSections,
  editedParagraphs: string[],
): RelinkResult {
  if (editedParagraphs.length !== previous.paragraphs.length) {
    return {
      ok: false,
      code: "PARAGRAPH_COUNT",
      message: `문단은 ${previous.paragraphs.length}개를 유지해야 합니다.`,
    };
  }
  const paragraphs = previous.paragraphs.map((prevP, pi) => {
    const pool = new Map<string, Sentence[]>();
    for (const s of prevP.sentences) {
      const key = stripSpaces(s.text);
      pool.set(key, [...(pool.get(key) ?? []), s]);
    }
    const sentences = splitSentences(editedParagraphs[pi] ?? "").map(
      (text, si): Sentence => {
        const kept = pool.get(stripSpaces(text))?.shift();
        if (kept) return { ...kept, text };
        return {
          id: `p${pi + 1}-e${si + 1}`,
          text,
          evidence: { student: true },
          feeling: false,
          confirmed: false,
        };
      },
    );
    return { role: prevP.role, sentences };
  });
  return { ok: true, sections: { paragraphs } };
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
