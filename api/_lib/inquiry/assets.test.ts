// 자산 신뢰도, 입력 검증, 경고, 출발 활동 후보 정렬 테스트(명세 No.31, 36~43).
import { describe, expect, it } from "vitest";
import {
  assetWarnings,
  reliabilityOf,
  sortRecordCandidates,
  subjectCounts,
  validateAssetInputs,
} from "./assets.js";
import { MAX_RECORD_CANDIDATES, ONELINE_MAX_CHARS } from "./constants.js";
import type { AssetInput, RecordCandidate } from "./types.js";

function rec(over: Partial<RecordCandidate> & { id: string }): RecordCandidate {
  return {
    sourceProgram: "deep",
    status: "confirmed",
    gradeLabel: "고1",
    semester: 1,
    subjectGroup: "교과",
    subject: "수학",
    topic: "주제",
    concept: "개념",
    limitation: "한계",
    confirmedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("reliabilityOf (No.38)", () => {
  it("record A, interview B, oneline C", () => {
    expect(reliabilityOf("record")).toBe("A");
    expect(reliabilityOf("interview")).toBe("B");
    expect(reliabilityOf("oneline")).toBe("C");
  });
});

describe("validateAssetInputs", () => {
  it("빈 배열은 통과한다(활동 0건 허용, No.4)", () => {
    expect(validateAssetInputs([])).toEqual({ ok: true });
  });

  it("record 는 activityRecordId 가 비면 안 된다", () => {
    expect(
      validateAssetInputs([{ kind: "record", activityRecordId: "  " }]),
    ).toEqual({ ok: false, code: "RECORD_ID_REQUIRED", index: 0 });
    expect(
      validateAssetInputs([{ kind: "record", activityRecordId: "r1" }]),
    ).toEqual({ ok: true });
  });

  it("interview 는 검증 코드를 그대로 돌려준다", () => {
    const noQ1: AssetInput = {
      kind: "interview",
      answers: { q1: "" },
      gaps: ["a"],
    };
    const noGaps: AssetInput = {
      kind: "interview",
      answers: { q1: "x" },
      gaps: [],
    };
    expect(validateAssetInputs([noQ1])).toEqual({
      ok: false,
      code: "Q1_REQUIRED",
      index: 0,
    });
    expect(validateAssetInputs([noGaps])).toEqual({
      ok: false,
      code: "GAPS_REQUIRED",
      index: 0,
    });
  });

  it("oneline 은 trim 뒤 1자 이상 200자 이하", () => {
    const one = (text: string): AssetInput[] => [{ kind: "oneline", text }];
    expect(validateAssetInputs(one("   "))).toEqual({
      ok: false,
      code: "ONELINE_REQUIRED",
      index: 0,
    });
    expect(validateAssetInputs(one("a".repeat(ONELINE_MAX_CHARS)))).toEqual({
      ok: true,
    });
    expect(
      validateAssetInputs(one(`  ${"a".repeat(ONELINE_MAX_CHARS)}  `)),
    ).toEqual({ ok: true });
    expect(validateAssetInputs(one("a".repeat(ONELINE_MAX_CHARS + 1)))).toEqual(
      { ok: false, code: "ONELINE_TOO_LONG", index: 0 },
    );
  });

  it("처음 실패한 항목의 index 를 알려 준다", () => {
    const items: AssetInput[] = [
      { kind: "record", activityRecordId: "r1" },
      { kind: "oneline", text: "" },
      { kind: "record", activityRecordId: "" },
    ];
    expect(validateAssetInputs(items)).toMatchObject({ ok: false, index: 1 });
  });
});

describe("assetWarnings (No.41, 42)", () => {
  const recordItem = (id: string): AssetInput => ({
    kind: "record",
    activityRecordId: id,
  });

  it("record 가 없으면 경고가 없다(교과 여부를 알 수 없음)", () => {
    expect(assetWarnings([], [])).toEqual([]);
    expect(
      assetWarnings([{ kind: "oneline", text: "주제" }], [rec({ id: "r1" })]),
    ).toEqual([]);
  });

  it("교과 record 가 하나라도 있으면 NO_SUBJECT_ASSET 이 없다", () => {
    const records = [
      rec({ id: "a", subjectGroup: "교과" }),
      rec({ id: "b", subjectGroup: "창체" }),
    ];
    expect(assetWarnings([recordItem("a"), recordItem("b")], records)).toEqual(
      [],
    );
  });

  it("교과가 아닌 record 만 있으면 NO_SUBJECT_ASSET", () => {
    const records = [
      rec({ id: "b", subjectGroup: "창체" }),
      rec({ id: "c", subjectGroup: null }),
    ];
    expect(assetWarnings([recordItem("b"), recordItem("c")], records)).toEqual([
      "NO_SUBJECT_ASSET",
    ]);
  });

  it("선택하지 않은 record 는 보지 않는다", () => {
    const records = [
      rec({ id: "a", subjectGroup: "교과" }),
      rec({ id: "b", subjectGroup: "창체" }),
    ];
    expect(assetWarnings([recordItem("b")], records)).toEqual([
      "NO_SUBJECT_ASSET",
    ]);
  });

  it("concept 와 limitation 이 둘 다 빈 record 가 있으면 LINK_MATERIAL_LACKING", () => {
    const records = [rec({ id: "a", concept: " ", limitation: null })];
    expect(assetWarnings([recordItem("a")], records)).toEqual([
      "LINK_MATERIAL_LACKING",
    ]);
  });

  it("둘 중 하나라도 있으면 연계 재료 부족이 아니다", () => {
    const records = [rec({ id: "a", concept: null, limitation: "한계" })];
    expect(assetWarnings([recordItem("a")], records)).toEqual([]);
  });

  it("두 경고가 함께 나오고 중복이 없다", () => {
    const records = [
      rec({ id: "a", subjectGroup: "창체", concept: null, limitation: null }),
      rec({ id: "b", subjectGroup: "창체", concept: "", limitation: "" }),
    ];
    expect(assetWarnings([recordItem("a"), recordItem("b")], records)).toEqual([
      "NO_SUBJECT_ASSET",
      "LINK_MATERIAL_LACKING",
    ]);
  });

  it("목록에 없는 id 는 무시한다", () => {
    expect(assetWarnings([recordItem("zzz")], [])).toEqual([]);
  });
});

describe("sortRecordCandidates (No.36)", () => {
  it("planned 는 제외한다", () => {
    const out = sortRecordCandidates(
      [rec({ id: "a", status: "planned" }), rec({ id: "b" })],
      null,
    );
    expect(out.map((r) => r.id)).toEqual(["b"]);
  });

  it("세션 과목과 같은 subject 가 먼저, 공백은 무시한다", () => {
    const out = sortRecordCandidates(
      [
        rec({ id: "a", subject: "국어", createdAt: "2026-03-01T00:00:00Z" }),
        rec({ id: "b", subject: " 수학 ", createdAt: "2026-01-01T00:00:00Z" }),
      ],
      "수학",
    );
    expect(out.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("같은 그룹 안에서는 confirmedAt 이 있으면 그것, 없으면 createdAt 내림차순", () => {
    const out = sortRecordCandidates(
      [
        rec({ id: "old", createdAt: "2026-01-01T00:00:00Z" }),
        rec({
          id: "confirmed",
          confirmedAt: "2026-05-01T00:00:00Z",
          createdAt: "2026-01-02T00:00:00Z",
        }),
        rec({ id: "new", createdAt: "2026-03-01T00:00:00Z" }),
      ],
      null,
    );
    expect(out.map((r) => r.id)).toEqual(["confirmed", "new", "old"]);
  });

  it("과목이 null 이면 과목 우선 없이 날짜순", () => {
    const out = sortRecordCandidates(
      [
        rec({ id: "a", subject: null, createdAt: "2026-02-01T00:00:00Z" }),
        rec({ id: "b", subject: "수학", createdAt: "2026-01-01T00:00:00Z" }),
      ],
      "수학",
    );
    expect(out.map((r) => r.id)).toEqual(["b", "a"]);
    expect(
      sortRecordCandidates(
        [
          rec({ id: "a", subject: null, createdAt: "2026-02-01T00:00:00Z" }),
          rec({ id: "b", subject: "수학", createdAt: "2026-01-01T00:00:00Z" }),
        ],
        null,
      ).map((r) => r.id),
    ).toEqual(["a", "b"]);
  });

  it("최대 20건으로 자르고 원본을 바꾸지 않는다", () => {
    const records = Array.from({ length: MAX_RECORD_CANDIDATES + 5 }, (_, i) =>
      rec({
        id: `r${i}`,
        createdAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
      }),
    );
    const copy = [...records];
    const out = sortRecordCandidates(records, null);
    expect(out).toHaveLength(MAX_RECORD_CANDIDATES);
    expect(out[0]?.id).toBe(`r${MAX_RECORD_CANDIDATES + 4}`);
    expect(records).toEqual(copy);
  });

  it("빈 배열은 빈 배열", () => {
    expect(sortRecordCandidates([], "수학")).toEqual([]);
  });
});

describe("subjectCounts (No.37)", () => {
  it("과목별 건수를 건수 내림차순, 같으면 이름순으로 돌려준다", () => {
    const out = subjectCounts([
      rec({ id: "1", subject: "수학" }),
      rec({ id: "2", subject: "국어" }),
      rec({ id: "3", subject: "수학" }),
      rec({ id: "4", subject: "과학" }),
    ]);
    expect(out).toEqual([
      { subject: "수학", count: 2 },
      { subject: "과학", count: 1 },
      { subject: "국어", count: 1 },
    ]);
  });

  it("subject 가 null 이거나 공백이면 미분류로 센다", () => {
    expect(
      subjectCounts([
        rec({ id: "1", subject: null }),
        rec({ id: "2", subject: "  " }),
      ]),
    ).toEqual([{ subject: "미분류", count: 2 }]);
  });

  it("빈 배열은 빈 배열", () => {
    expect(subjectCounts([])).toEqual([]);
  });
});
