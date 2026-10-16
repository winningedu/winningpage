import { describe, expect, it } from "vitest";
import {
  buildAliasTable,
  restoreEvidenceIds,
  scrubAliasText,
  toActivityId,
  toAlias,
} from "./evidenceAlias.js";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const U3 = "33333333-3333-4333-8333-333333333333";

const table = buildAliasTable({
  activities: [{ id: U1 }, { id: U2 }, { id: U3 }],
});

describe("별칭 표", () => {
  it("활동 순서대로 a1 부터 붙인다", () => {
    expect(toAlias(table, U1)).toBe("a1");
    expect(toAlias(table, U2)).toBe("a2");
    expect(toAlias(table, U3)).toBe("a3");
  });

  it("별칭에서 활동 id 로 되돌린다", () => {
    expect(toActivityId(table, "a1")).toBe(U1);
    expect(toActivityId(table, "a3")).toBe(U3);
  });

  it("모르는 값은 그대로 둔다", () => {
    expect(toAlias(table, "other")).toBe("other");
    expect(toActivityId(table, "a99")).toBe("a99");
    expect(toActivityId(table, U2)).toBe(U2);
  });

  it("같은 context 면 항상 같은 표가 나온다", () => {
    const again = buildAliasTable({
      activities: [{ id: U1 }, { id: U2 }, { id: U3 }],
    });
    expect(toAlias(again, U3)).toBe("a3");
  });
});

describe("restoreEvidenceIds", () => {
  it("근거 필드의 별칭만 활동 id 로 되돌린다", () => {
    const out = restoreEvidenceIds(table, {
      signals: [{ activityId: "a2", summary: "a1 활동" }],
      sections: [
        {
          id: "1-8",
          body: {
            items: [{ text: "a1 활동 이어짐", evidence_ids: ["a1", "a3"] }],
            rows: [{ label: "a2", value: "a3", evidence_ids: ["a2"] }],
          },
          evidence_ids: ["a1"],
        },
      ],
      match: { aligned: [{ text: "a1", evidenceIds: ["a2"] }] },
      body: { linked: ["a1", "a2"] },
    });
    expect(out).toEqual({
      signals: [{ activityId: U2, summary: "a1 활동" }],
      sections: [
        {
          id: "1-8",
          body: {
            items: [{ text: "a1 활동 이어짐", evidence_ids: [U1, U3] }],
            rows: [{ label: "a2", value: "a3", evidence_ids: [U2] }],
          },
          evidence_ids: [U1],
        },
      ],
      match: { aligned: [{ text: "a1", evidenceIds: [U2] }] },
      body: { linked: [U1, U2] },
    });
  });

  it("되돌리지 못한 별칭과 활동 id 는 그대로 둔다", () => {
    expect(
      restoreEvidenceIds(table, {
        evidence_ids: ["a99", U1],
        activityId: "a99",
      }),
    ).toEqual({ evidence_ids: ["a99", U1], activityId: "a99" });
  });

  it("문자열이 아닌 값은 건드리지 않는다", () => {
    expect(
      restoreEvidenceIds(table, {
        linked: 3,
        evidence_ids: [1, "a1"],
        activityId: null,
      }),
    ).toEqual({ linked: 3, evidence_ids: [1, U1], activityId: null });
  });
});

describe("본문 별칭 정리", () => {
  const acts = Array.from({ length: 12 }, (_, i) => ({
    id: `0000000${(i + 1).toString(16)}-1111-4111-8111-000000000000`,
  }));
  const t = buildAliasTable({ activities: acts });
  const clean = (v: unknown) => scrubAliasText(t, v);

  it("끝 괄호 목록은 앞 공백까지 지우고 행 근거로 옮긴다", () => {
    const out = clean({
      rows: [
        {
          label: "성향",
          value: "분석을 시도한다. (a7, a10, a12)",
          evidence_ids: ["a1"],
        },
      ],
    });
    expect(out).toEqual({
      rows: [
        {
          label: "성향",
          value: "분석을 시도한다.",
          evidence_ids: ["a1", "a7", "a10", "a12"],
        },
      ],
    });
  });

  it("붙어 있는 괄호 별칭과 쉼표 문장을 자연스럽게 남긴다", () => {
    const out = clean({
      rows: [
        {
          label: "근거 활동",
          value: "관계 분석(a4), 기준 재검토(a7)",
          evidence_ids: [],
        },
      ],
    }) as { rows: { value: string; evidence_ids: string[] }[] };
    expect(out.rows[0]?.value).toBe("관계 분석, 기준 재검토");
    expect(out.rows[0]?.evidence_ids).toEqual(["a4", "a7"]);
  });

  it("맨 별칭은 바로 붙은 쉼표 하나와 함께 지운다", () => {
    const out = clean({
      items: [{ text: "열 전달 a3, a5 실험을 했다", evidence_ids: [] }],
    }) as {
      items: { text: string; evidence_ids: string[] }[];
    };
    expect(out.items[0]?.text).toBe("열 전달 실험을 했다");
    expect(out.items[0]?.evidence_ids).toEqual(["a3", "a5"]);
    const end = clean({
      items: [{ text: "열 전달, a3", evidence_ids: [] }],
    }) as {
      items: { text: string }[];
    };
    expect(end.items[0]?.text).toBe("열 전달");
  });

  it("UUID 도 표에 있으면 같은 방식으로 처리한다", () => {
    const id = acts[1]?.id ?? "";
    const out = clean({
      rows: [{ label: "x", value: `분석 (${id})`, evidence_ids: [] }],
    }) as {
      rows: { value: string; evidence_ids: string[] }[];
    };
    expect(out.rows[0]?.value).toBe("분석");
    expect(out.rows[0]?.evidence_ids).toEqual(["a2"]);
    const unknown = "99999999-1111-4111-8111-000000000000";
    const keep = clean({
      rows: [{ label: "x", value: `분석 (${unknown})`, evidence_ids: [] }],
    }) as {
      rows: { value: string }[];
    };
    expect(keep.rows[0]?.value).toBe(`분석 (${unknown})`);
  });

  it("match 항목 text 의 별칭은 그 항목 evidenceIds 로 간다", () => {
    const out = clean({
      match: {
        aligned: [{ text: "진로와 일치(a2)", evidenceIds: ["a1"] }],
        conflicting: [{ text: "어긋남 a3", evidenceIds: [] }],
      },
    });
    expect(out).toEqual({
      match: {
        aligned: [{ text: "진로와 일치", evidenceIds: ["a1", "a2"] }],
        conflicting: [{ text: "어긋남", evidenceIds: ["a3"] }],
      },
    });
  });

  it("근거 필드 개념이 없는 narrative 와 planDraft 는 별칭만 지우고 근거는 버린다", () => {
    const out = clean({
      narrative: { theme: "열 탐구(a1)", subthemes: [{ text: "확장 a2" }] },
      planDraft: [{ title: "실험 설계", description: "a3 를 이어 쓴다" }],
    });
    expect(out).toEqual({
      narrative: { theme: "열 탐구", subthemes: [{ text: "확장" }] },
      planDraft: [{ title: "실험 설계", description: "를 이어 쓴다" }],
    });
  });

  it("prose 본문의 별칭은 섹션 근거로 간다", () => {
    const out = clean({
      sections: [
        {
          id: "1-11",
          status: "ok",
          body: { text: "정체성이 보인다 (a5)." },
          evidence_ids: [],
        },
      ],
    }) as { sections: { body: { text: string }; evidence_ids: string[] }[] };
    expect(out.sections[0]?.body.text).toBe("정체성이 보인다.");
    expect(out.sections[0]?.evidence_ids).toEqual(["a5"]);
  });

  it("별칭이 아닌 문자열은 그대로 둔다", () => {
    const v = {
      rows: [
        {
          label: "표에 없는 a99",
          value: "a99 와 data, a, a1x, xa2, banana2, a07, 용지",
          evidence_ids: [],
        },
      ],
    };
    expect(clean(v)).toEqual(v);
  });

  it("뒤에 한글이 붙은 표 안의 별칭은 토큰으로 보고, 표 밖이면 둔다", () => {
    const out = clean({
      rows: [{ label: "l", value: "a4용지 a20용지", evidence_ids: [] }],
    }) as {
      rows: { value: string; evidence_ids: string[] }[];
    };
    expect(out.rows[0]?.value).toBe("용지 a20용지");
    expect(out.rows[0]?.evidence_ids).toEqual(["a4"]);
  });

  it("근거 필드의 문자열은 건드리지 않고, 입력을 바꾸지 않는다", () => {
    const v = {
      rows: [
        {
          label: "x",
          value: "v (a1)",
          evidence_ids: ["a2", "a3"],
          activityId: "a4",
        },
      ],
    };
    const snapshot = JSON.stringify(v);
    const out = clean(v) as {
      rows: { evidence_ids: string[]; activityId: string }[];
    };
    expect(out.rows[0]?.evidence_ids).toEqual(["a2", "a3", "a1"]);
    expect(out.rows[0]?.activityId).toBe("a4");
    expect(JSON.stringify(v)).toBe(snapshot);
  });

  it("일부만 별칭인 괄호는 별칭만 지운다", () => {
    const out = clean({
      rows: [{ label: "x", value: "분석 (a2, a99)", evidence_ids: [] }],
    }) as {
      rows: { value: string; evidence_ids: string[] }[];
    };
    expect(out.rows[0]?.value).toBe("분석 (a99)");
    expect(out.rows[0]?.evidence_ids).toEqual(["a2"]);
  });
});
