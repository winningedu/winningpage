import { describe, expect, it } from "vitest";
import {
  buildAliasTable,
  restoreEvidenceIds,
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
