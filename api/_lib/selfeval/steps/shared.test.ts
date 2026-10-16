import { describe, expect, it } from "vitest";
import type { SessionRow } from "../rows.js";
import type { SessionActivityWithRecord } from "../view.js";
import {
  activeGrowth,
  activityNameOf,
  careerOf,
  isUuid,
  readAnalysis,
  reportOut,
  reportRowOut,
  splitActivities,
} from "./shared.js";

const record = (id: string, topic: string | null) =>
  ({ id, topic }) as SessionActivityWithRecord["record"];
const act = (id: string, role: "core" | "support", topic = id) =>
  ({
    activity_record_id: id,
    role,
    analysis: null,
    analysis_source: null,
    record: record(id, topic),
  }) as unknown as SessionActivityWithRecord;

describe("isUuid", () => {
  it("UUID 형식만 통과한다", () => {
    expect(isUuid("3f2b8c1e-9d4a-4b6e-8a1c-0e5d7f9a2b3c")).toBe(true);
    expect(isUuid("abc")).toBe(false);
    expect(isUuid(1)).toBe(false);
  });
});

describe("splitActivities", () => {
  it("핵심 하나와 보조 나머지로 가른다", () => {
    const { core, supports } = splitActivities([
      act("s1", "support"),
      act("c1", "core"),
    ]);
    expect(core.activity_record_id).toBe("c1");
    expect(supports.map((s) => s.activity_record_id)).toEqual(["s1"]);
  });

  it("핵심이 없으면 던진다", () => {
    expect(() => splitActivities([act("s1", "support")])).toThrow();
  });
});

describe("readAnalysis", () => {
  it("분석 모양이면 그대로 돌려주고 아니면 던진다", () => {
    const a = { values: {}, sources: {}, conflicts: [] };
    expect(readAnalysis(a)).toBe(a);
    expect(() => readAnalysis(null)).toThrow();
    expect(() => readAnalysis({ values: {} })).toThrow();
  });
});

describe("activityNameOf", () => {
  const session = { activity_name: "동아리명", subject: "수학" } as SessionRow;
  it("기록 제목, 활동명, 과목 순으로 쓴다", () => {
    expect(activityNameOf(record("a", " 제목 "), session)).toBe("제목");
    expect(activityNameOf(record("a", null), session)).toBe("동아리명");
    expect(
      activityNameOf(record("a", ""), { ...session, activity_name: null }),
    ).toBe("수학");
  });
});

describe("careerOf, activeGrowth", () => {
  it("빈 진로 객체는 비어 있는 진로 정보로 읽는다", () => {
    expect(careerOf({ career: {} })).toEqual({
      career: null,
      department: null,
      universities: [],
    });
    expect(
      careerOf({
        career: { career: "의사", department: null, universities: ["A대"] },
      }),
    ).toEqual({ career: "의사", department: null, universities: ["A대"] });
  });

  it("성장설계는 켜져 있고 스냅샷이 있을 때만 적용한다", () => {
    const snap = { reportId: "r" } as never;
    expect(
      activeGrowth({
        growth_applied: true,
        growth_snapshot: snap,
      }),
    ).toBe(snap);
    expect(
      activeGrowth({
        growth_applied: false,
        growth_snapshot: snap,
      }),
    ).toBeNull();
    expect(
      activeGrowth({
        growth_applied: true,
        growth_snapshot: null,
      }),
    ).toBeNull();
  });
});

describe("reportOut", () => {
  it("응답에 필요한 키만 남긴다", () => {
    expect(
      reportOut({
        id: "r1",
        revision: 2,
        sections: { a: 1 },
        charCount: { withSpace: 3, withoutSpace: 2 },
        score: 5,
        mandatoryFixes: null,
        createdAt: "x",
      }),
    ).toEqual({
      id: "r1",
      revision: 2,
      sections: { a: 1 },
      charCount: { withSpace: 3, withoutSpace: 2 },
    });
  });
});

describe("reportRowOut", () => {
  it("DB 행을 응답 모양으로 바꾼다", () => {
    expect(
      reportRowOut({
        id: "r1",
        session_id: "s",
        report_type: "edited",
        revision: 3,
        sections: { a: 1 },
        char_count: { withSpace: 3, withoutSpace: 2 },
        score: null,
        mandatory_fixes: null,
        created_at: "x",
      }),
    ).toEqual({
      id: "r1",
      revision: 3,
      sections: { a: 1 },
      charCount: { withSpace: 3, withoutSpace: 2 },
    });
  });
});
