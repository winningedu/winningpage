import { describe, expect, it } from "vitest";
import { carriedWords } from "./linkWrite.js";
import type { ActivityRecordLike } from "./types.js";

const rec = (over: Partial<ActivityRecordLike> = {}): ActivityRecordLike => ({
  id: "r1",
  sourceProgram: "performance",
  status: "final",
  gradeLabel: null,
  semester: null,
  subjectGroup: "교과",
  subject: "수학",
  topic: null,
  concept: null,
  method: null,
  result: null,
  limitation: null,
  numbers: [],
  sources: [],
  createdAt: "2026-01-01",
  ...over,
});

describe("carriedWords", () => {
  it("개념명, 자료명, 방법명, 수치를 한 낱말씩 번갈아 뽑는다", () => {
    const words = carriedWords(
      rec({
        concept: "수요 탄력성과 기울기",
        sources: ["통계청 가계동향조사"],
        method: "엑셀 회귀분석",
        numbers: ["표본 120명"],
      }),
    );
    expect(words).toEqual(["수요", "통계청 가계동향조사", "엑셀", "120명"]);
  });

  it("최대 네 낱말이고 중복은 한 번만 낸다", () => {
    const words = carriedWords(
      rec({
        concept: "수요 탄력성 기울기 공급",
        method: "수요 회귀분석 검산",
        sources: ["자료 가", "자료 나", "자료 다"],
        numbers: ["10명", "20명", "10명"],
      }),
    );
    expect(words).toHaveLength(4);
    expect(new Set(words).size).toBe(4);
  });

  it("같은 기록이면 항상 같은 낱말을 낸다", () => {
    const r = rec({ concept: "수요 탄력성", numbers: ["3회"] });
    expect(carriedWords(r)).toEqual(carriedWords(r));
  });

  it("7항목이 비어 있으면 빈 배열이다", () => {
    expect(carriedWords(rec())).toEqual([]);
  });
});
