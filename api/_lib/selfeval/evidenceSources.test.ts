import { describe, expect, it } from "vitest";
import {
  buildWriteEvidence,
  type RecordExtras,
  recordStatusOf,
  sourceTypeOfRecord,
} from "./evidenceSources.js";
import type { SessionActivityWithRecord } from "./view.js";

describe("sourceTypeOfRecord", () => {
  const base = {
    sourceProgram: "manual" as const,
    entryKind: null,
    subjectGroup: null,
  };
  it("직접 입력은 entry_kind 로 정한다", () => {
    expect(sourceTypeOfRecord({ ...base, entryKind: "performance" })).toBe("P");
    expect(sourceTypeOfRecord({ ...base, entryKind: "deep" })).toBe("D");
    expect(sourceTypeOfRecord({ ...base, entryKind: "activity" })).toBe("A");
  });
  it("entry_kind 가 없는 직접 입력은 교과면 P, 아니면 A 다", () => {
    expect(sourceTypeOfRecord({ ...base, subjectGroup: "교과" })).toBe("P");
    expect(sourceTypeOfRecord({ ...base, subjectGroup: "동아리" })).toBe("A");
    expect(sourceTypeOfRecord(base)).toBe("A");
  });
  it("수행평가와 심화탐구 기록은 출처 프로그램으로 정한다", () => {
    expect(sourceTypeOfRecord({ ...base, sourceProgram: "performance" })).toBe(
      "P",
    );
    expect(sourceTypeOfRecord({ ...base, sourceProgram: "deep" })).toBe("D");
  });
});

describe("recordStatusOf", () => {
  it("record_status 가 있으면 그대로, 없으면 status 에서 파생한다", () => {
    expect(
      recordStatusOf({ recordStatus: "in_progress", status: "final" }),
    ).toBe("in_progress");
    expect(recordStatusOf({ recordStatus: null, status: "planned" })).toBe(
      "plan",
    );
    expect(recordStatusOf({ recordStatus: null, status: "draft" })).toBe(
      "completed",
    );
  });
});

const rec = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  sourceProgram: "performance" as const,
  status: "final" as const,
  gradeLabel: null,
  semester: null,
  subjectGroup: "교과",
  subject: "수학",
  topic: `활동 ${id}`,
  concept: "개념 글",
  method: "방법 글",
  result: "결과 글 3개",
  limitation: "",
  numbers: [],
  sources: [],
  createdAt: "2026-01-01",
  ...over,
});
const analysis = (over: Record<string, string> = {}) => {
  const fields = [
    "motive",
    "concept",
    "action",
    "method",
    "result",
    "role",
    "collaboration",
    "learning",
    "career",
    "limitation",
    "next",
  ];
  return {
    values: Object.fromEntries(fields.map((f) => [f, over[f] ?? ""])),
    sources: Object.fromEntries(
      fields.map((f) => [f, over[f] ? "record" : "empty"]),
    ),
    conflicts: [],
  };
};
const row = (
  id: string,
  role: "core" | "support",
  a: unknown,
  over = {},
): SessionActivityWithRecord => ({
  activity_record_id: id,
  role,
  fit_score: null,
  fit_reasons: null,
  analysis: a,
  analysis_source: null,
  record: rec(id, over) as SessionActivityWithRecord["record"],
});
const extras = new Map<string, RecordExtras>([
  [
    "s1",
    {
      recordStatus: null,
      entryKind: null,
      summary: "요약 글",
      reflection: "성찰 글",
    },
  ],
  [
    "w1",
    {
      recordStatus: "in_progress",
      entryKind: null,
      summary: null,
      reflection: null,
    },
  ],
]);

describe("buildWriteEvidence", () => {
  const out = buildWriteEvidence(
    [
      row("c1", "core", analysis({ motive: "계기 글", result: "핵심 결과" })),
      row("s1", "support", null, { sourceProgram: "deep" }),
      row("w1", "support", null),
    ],
    extras,
    [
      {
        fromRecordId: "c1",
        toRecordId: "s1",
        linkType: "deepen",
        quoteFrom: "앞 인용",
        quoteTo: null,
      },
    ],
    [
      {
        id: "m1",
        writtenAt: "2026-05-03",
        text: "메모 글",
        confirmed: true,
        included: true,
      },
      {
        id: "m2",
        writtenAt: null,
        text: "미확인",
        confirmed: false,
        included: true,
      },
      {
        id: "m3",
        writtenAt: null,
        text: "제외",
        confirmed: true,
        included: false,
      },
    ],
  );

  it("핵심은 분석 값이 있는 항목, 다른 기록은 분석이 없으면 기록 항목을 근거 글로 쓴다", () => {
    const c = out.sources.records.find((r) => r.id === "c1");
    expect(c?.itemTexts).toEqual({ motive: "계기 글", result: "핵심 결과" });
    const s = out.sources.records.find((r) => r.id === "s1");
    expect(s).toMatchObject({ sourceType: "D", completed: true });
    expect(s?.itemTexts).toEqual({
      concept: "개념 글",
      method: "방법 글",
      result: "결과 글 3개",
    });
  });

  it("진행 중 기록은 근거 원천에는 있지만 완료로 치지 않고 프롬프트 기록에서는 뺀다", () => {
    expect(out.sources.records.find((r) => r.id === "w1")?.completed).toBe(
      false,
    );
    expect(out.prompt.supports.map((s) => s.activityId)).toEqual(["s1"]);
  });

  it("확인했고 포함한 메모만 근거 원천과 프롬프트에 들어간다", () => {
    expect(out.sources.memos).toEqual([{ id: "m1", text: "메모 글" }]);
    expect(out.prompt.memos).toEqual([
      { id: "m1", writtenAt: "2026-05-03", text: "메모 글" },
    ]);
  });

  it("다른 기록 요약에 요약, 성찰, 연계 유형과 인용이 들어간다", () => {
    const s = out.prompt.supports[0];
    expect(s?.summary).toContain("요약: 요약 글");
    expect(s?.summary).toContain("성찰: 성찰 글");
    expect(s?.link).toContain("deepen");
    expect(s?.link).toContain("앞 인용");
  });

  it("옛 근거의 출처 유형을 기록 id 로 찾는다", () => {
    expect(out.typeOf("s1")).toBe("D");
    expect(out.typeOf("nope")).toBeNull();
  });
});
