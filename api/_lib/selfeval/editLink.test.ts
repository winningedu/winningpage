import { describe, expect, it } from "vitest";
import {
  confirmFeeling,
  paragraphTexts,
  plainText,
  relinkEdited,
  repickEvidence,
} from "./editLink.js";
import type { EvidenceSources } from "./evidence.js";
import type { GenerationSections, SentenceEvidence } from "./types.js";

const evOf = (item: SentenceEvidence["item"]): SentenceEvidence[] => [
  { sourceType: "P", refId: "a1", item, weight: "main" },
];

const prev: GenerationSections = {
  paragraphs: [
    {
      role: "process",
      sentences: [
        {
          id: "p1-s1",
          text: "계수를 바꿔 관찰했다.",
          evidence: evOf("method"),
          feeling: false,
          confirmed: false,
        },
        {
          id: "p1-s2",
          text: "폭이 좁아졌다고 느꼈다.",
          evidence: [],
          feeling: true,
          confirmed: true,
        },
      ],
    },
    {
      role: "wrap",
      sentences: [
        {
          id: "p2-s1",
          text: "다음에는 소수 계수를 본다.",
          evidence: evOf("result"),
          feeling: false,
          confirmed: false,
        },
      ],
    },
  ],
};

describe("plainText / paragraphTexts", () => {
  it("문장은 공백, 문단은 빈 줄로 잇는다", () => {
    expect(paragraphTexts(prev)).toEqual([
      "계수를 바꿔 관찰했다. 폭이 좁아졌다고 느꼈다.",
      "다음에는 소수 계수를 본다.",
    ]);
    expect(plainText(prev)).toBe(
      "계수를 바꿔 관찰했다. 폭이 좁아졌다고 느꼈다.\n\n다음에는 소수 계수를 본다.",
    );
  });
});

describe("relinkEdited", () => {
  it("같은 문장은 id, evidence, feeling, confirmed 를 유지한다(공백 차이 무시)", () => {
    const r = relinkEdited(prev, [
      "계수를  바꿔 관찰했다. 폭이 좁아졌다고 느꼈다.",
      "다음에는 소수 계수를 본다.",
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sections.paragraphs[0]?.sentences[1]).toMatchObject({
      id: "p1-s2",
      feeling: true,
      confirmed: true,
    });
    expect(r.sections.paragraphs[0]?.sentences[0]?.evidence).toEqual(
      evOf("method"),
    );
  });

  it("바뀌거나 새 문장은 새 id 와 student evidence, 미확인으로 둔다", () => {
    const r = relinkEdited(prev, [
      "계수를 바꿔 관찰했다. 직접 표로 정리했다.",
      "다음에는 소수 계수를 본다.",
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sections.paragraphs[0]?.sentences[1]).toEqual({
      id: "p1-e2",
      text: "직접 표로 정리했다.",
      evidence: [
        { sourceType: "S", refId: null, item: "student_input", weight: "main" },
      ],
      feeling: false,
      confirmed: false,
    });
  });

  it("사라진 문장은 버리고 role 은 유지한다", () => {
    const r = relinkEdited(prev, [
      "계수를 바꿔 관찰했다.",
      "다음에는 소수 계수를 본다.",
    ]);
    expect(r.ok && r.sections.paragraphs[0]?.sentences).toHaveLength(1);
    expect(r.ok && r.sections.paragraphs[1]?.role).toBe("wrap");
  });

  it("문단 수를 줄이거나 늘려도 같은 문장의 연결을 유지한다(명세 No.44)", () => {
    const merged = relinkEdited(prev, [
      "계수를 바꿔 관찰했다. 다음에는 소수 계수를 본다.",
    ]);
    expect(merged.ok).toBe(true);
    if (merged.ok) {
      expect(merged.sections.paragraphs).toHaveLength(1);
      expect(merged.sections.paragraphs[0]?.sentences[1]).toMatchObject({
        id: "p2-s1",
        evidence: evOf("result"),
      });
    }
    const split = relinkEdited(prev, [
      "계수를 바꿔 관찰했다.",
      "폭이 좁아졌다고 느꼈다.",
      "다음에는 소수 계수를 본다.",
    ]);
    expect(split.ok).toBe(true);
    if (split.ok) {
      expect(split.sections.paragraphs).toHaveLength(3);
      expect(split.sections.paragraphs[1]?.sentences[0]).toMatchObject({
        id: "p1-s2",
        confirmed: true,
      });
      expect(split.sections.paragraphs[2]?.role).toBeUndefined();
    }
  });

  it("문단이 하나도 없으면 PARAGRAPH_COUNT 를 돌려준다", () => {
    const r = relinkEdited(prev, []);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("PARAGRAPH_COUNT");
      expect(r.message).toBe("문단은 1개 이상이어야 합니다.");
    }
  });
});

describe("confirmFeeling", () => {
  it("해당 문장만 confirmed true 로 바꾸고 없는 id 는 그대로 둔다", () => {
    const r = confirmFeeling(prev, "p2-s1");
    expect(r.paragraphs[1]?.sentences[0]?.confirmed).toBe(true);
    expect(r.paragraphs[0]?.sentences[0]?.confirmed).toBe(false);
    expect(confirmFeeling(prev, "nope")).toEqual(prev);
  });
});

describe("repickEvidence", () => {
  const sources: EvidenceSources = {
    records: [
      {
        id: "a1",
        sourceType: "P",
        completed: true,
        itemTexts: { method: "계수를 바꿈", result: "폭이 좁아짐" },
      },
    ],
    memos: [{ id: "m1", text: "메모 글" }],
  };
  const pick = (refId: string, item: string) => ({ refId, item });

  it("고른 기록과 메모로 그 문장의 근거를 바꾼다", () => {
    const r = repickEvidence(
      prev,
      "p1-s2",
      [pick("a1", "result"), pick("m1", "action")],
      sources,
    );
    expect(r?.paragraphs[0]?.sentences[1]?.evidence).toEqual([
      { sourceType: "P", refId: "a1", item: "result", weight: "main" },
      { sourceType: "H", refId: "m1", item: "action", weight: "main" },
    ]);
    expect(r?.paragraphs[0]?.sentences[1]?.feeling).toBe(false);
    expect(r?.paragraphs[0]?.sentences[0]).toEqual(
      prev.paragraphs[0]?.sentences[0],
    );
  });

  it("선택 밖 근거는 버리고 하나도 남지 않으면 학생 입력 근거로 둔다", () => {
    const r = repickEvidence(prev, "p1-s1", [pick("zzz", "method")], sources);
    expect(r?.paragraphs[0]?.sentences[0]?.evidence).toEqual([
      { sourceType: "S", refId: null, item: "student_input", weight: "main" },
    ]);
  });

  it("없는 문장 id 는 null 이다", () => {
    expect(repickEvidence(prev, "nope", [], sources)).toBeNull();
  });
});
