import { describe, expect, it } from "vitest";

import {
  classifyFieldSources,
  emptyAnalysis,
  mergeStudentEdits,
  recordText,
} from "./analysisSources.js";
import type { ActivityRecordLike, AnalysisField } from "./types.js";
import { ANALYSIS_FIELDS } from "./types.js";

const record = (o: Partial<ActivityRecordLike> = {}): ActivityRecordLike => ({
  id: "r1",
  sourceProgram: "performance",
  status: "confirmed",
  gradeLabel: "고1",
  semester: 1,
  subjectGroup: "수학",
  subject: "수학",
  topic: "표본 조사 설계",
  concept: "모평균 추정",
  method: "설문 직접 제작",
  result: "신뢰구간 해석",
  limitation: "표본 부족",
  numbers: ["30명"],
  sources: ["교과서"],
  createdAt: "2026-01-01T00:00:00Z",
  ...o,
});

describe("recordText", () => {
  it("7항목을 합치고 배열 항목도 풀어서 넣는다", () => {
    const t = recordText(record());
    for (const w of [
      "표본 조사 설계",
      "모평균",
      "설문",
      "신뢰구간",
      "표본 부족",
      "30명",
      "교과서",
    ]) {
      expect(t).toContain(w);
    }
  });
  it("null 항목은 건너뛴다", () => {
    expect(
      recordText(
        record({
          topic: null,
          concept: null,
          method: null,
          result: null,
          limitation: null,
          numbers: null,
          sources: null,
        }),
      ),
    ).toBe("");
  });
});

describe("emptyAnalysis", () => {
  it("11항목 모두 빈 값과 empty 출처, 충돌 없음", () => {
    const a = emptyAnalysis();
    for (const f of ANALYSIS_FIELDS) {
      expect(a.values[f]).toBe("");
      expect(a.sources[f]).toBe("empty");
    }
    expect(a.conflicts).toEqual([]);
  });
});

describe("classifyFieldSources", () => {
  const values = (o: Partial<Record<AnalysisField, string>>) => ({
    ...emptyAnalysis().values,
    ...o,
  });
  it("빈 값은 empty", () => {
    expect(classifyFieldSources(values({}), record()).motive).toBe("empty");
  });
  it("기록에 있는 낱말이 있으면 record", () => {
    expect(
      classifyFieldSources(values({ result: "신뢰구간 계산" }), record())
        .result,
    ).toBe("record");
  });
  it("기록에 없는 값은 student", () => {
    expect(
      classifyFieldSources(values({ motive: "뉴스에서 궁금했다" }), record())
        .motive,
    ).toBe("student");
  });
});

describe("mergeStudentEdits", () => {
  const prev = () => {
    const a = emptyAnalysis();
    a.values.result = "신뢰구간 계산";
    a.sources.result = "record";
    a.conflicts = [
      {
        kind: "numbers",
        a: { activityId: "a", text: "1" },
        b: { activityId: "b", text: "2" },
        resolved: null,
      },
    ];
    return a;
  };
  it("바뀐 항목만 다시 분류하고 충돌은 유지한다", () => {
    const m = mergeStudentEdits(prev(), { motive: "혼자 궁금해서" }, record());
    expect(m.values.motive).toBe("혼자 궁금해서");
    expect(m.sources.motive).toBe("student");
    expect(m.sources.result).toBe("record");
    expect(m.conflicts).toHaveLength(1);
  });
  it("값이 같으면 기존 출처를 유지한다", () => {
    const p = prev();
    p.sources.result = "student";
    const m = mergeStudentEdits(p, { result: "신뢰구간 계산" }, record());
    expect(m.sources.result).toBe("student");
  });
  it("비운 항목은 empty 가 된다", () => {
    const m = mergeStudentEdits(prev(), { result: "" }, record());
    expect(m.sources.result).toBe("empty");
  });
  it("원본을 바꾸지 않는다", () => {
    const p = prev();
    mergeStudentEdits(p, { motive: "x항목" }, record());
    expect(p.values.motive).toBe("");
  });
});
