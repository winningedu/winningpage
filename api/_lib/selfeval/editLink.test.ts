import { describe, expect, it } from "vitest";
import {
  confirmFeeling,
  paragraphTexts,
  plainText,
  relinkEdited,
} from "./editLink.js";
import type { GenerationSections } from "./types.js";

const prev: GenerationSections = {
  paragraphs: [
    {
      role: "process",
      sentences: [
        {
          id: "p1-s1",
          text: "계수를 바꿔 관찰했다.",
          evidence: { activityId: "a1", field: "method" },
          feeling: false,
          confirmed: false,
        },
        {
          id: "p1-s2",
          text: "폭이 좁아졌다고 느꼈다.",
          evidence: null,
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
          evidence: { activityId: "a1", field: "result" },
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
    expect(r.sections.paragraphs[0]?.sentences[0]?.evidence).toEqual({
      activityId: "a1",
      field: "method",
    });
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
      evidence: { student: true },
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

  it("문단 수가 다르면 PARAGRAPH_COUNT 를 돌려준다", () => {
    const r = relinkEdited(prev, ["하나뿐"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PARAGRAPH_COUNT");
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
