import { describe, expect, test } from "vitest";
import type { EntryResponse } from "@/lib/selfeval/types";
import {
  deriveStartMode,
  monthsSince,
  staleLabel,
  studentSummaryLine,
} from "./startLogic";

type Entry = EntryResponse["entry"];

function entry(over: Partial<Entry> = {}): Entry {
  return {
    quota: null,
    allowed: true,
    activityCount: 5,
    openSession: null,
    growth: null,
    profile: null,
    replyResent: 0,
    academicYearDefault: 2026,
    ...over,
  };
}

const OPEN = {
  id: "s1",
  status: "draft",
  currentStep: 2,
  route: "analysis",
  area: "subject",
  subject: "수학",
  activityName: null,
  lastActivityAt: "2026-10-01T00:00:00Z",
} as const;

describe("deriveStartMode", () => {
  test("열린 세션이 없고 횟수와 활동이 있으면 new", () => {
    expect(deriveStartMode(entry(), 3)).toEqual({ mode: "new" });
  });

  test("열린 세션이 있으면 resume 이고 이어갈 경로를 단계에서 고른다", () => {
    expect(deriveStartMode(entry({ openSession: OPEN }), 3)).toEqual({
      mode: "resume",
      sessionId: "s1",
      resumeTo: "/app/selfeval/s/s1/analysis",
    });
  });

  test("열린 세션이 있으면 잔여가 0이어도 이어쓰기를 막지 않는다", () => {
    expect(deriveStartMode(entry({ openSession: OPEN }), 0).mode).toBe(
      "resume",
    );
  });

  test("잔여가 0이면 quota_zero", () => {
    expect(deriveStartMode(entry(), 0)).toEqual({ mode: "quota_zero" });
  });

  test("잔여를 모르면(null) 막지 않는다", () => {
    expect(deriveStartMode(entry(), null).mode).toBe("new");
  });

  test("저장된 활동이 0건이면 no_activities", () => {
    expect(deriveStartMode(entry({ activityCount: 0 }), 2)).toEqual({
      mode: "no_activities",
    });
  });

  test("잔여 0이 활동 0건보다 우선한다", () => {
    expect(deriveStartMode(entry({ activityCount: 0 }), 0).mode).toBe(
      "quota_zero",
    );
  });
});

describe("monthsSince", () => {
  const now = new Date("2026-10-06T00:00:00Z");
  test("달 단위 경과를 내림으로 센다", () => {
    expect(monthsSince("2026-04-06T00:00:00Z", now)).toBe(6);
    expect(monthsSince("2026-04-07T00:00:00Z", now)).toBe(5);
    expect(monthsSince("2026-10-01T00:00:00Z", now)).toBe(0);
  });
  test("해석할 수 없는 날짜는 null", () => {
    expect(monthsSince("nope", now)).toBeNull();
  });
});

describe("staleLabel", () => {
  test("경과 개월 수를 문장으로 만든다", () => {
    expect(
      staleLabel("2026-04-06T00:00:00Z", new Date("2026-10-06T00:00:00Z")),
    ).toBe("발행일이 6개월 지났어요");
  });
  test("개월 수를 모르면 null", () => {
    expect(staleLabel("nope", new Date())).toBeNull();
  });
});

describe("studentSummaryLine", () => {
  test("학년 학기와 진로 학과를 이어 준다", () => {
    expect(
      studentSummaryLine({
        gradeLabel: "고2",
        semester: 2,
        career: "데이터 분석",
        department: "도시공학과",
        universities: [],
      }),
    ).toBe("고2 2학기, 도시공학과 희망");
  });
  test("값 있는 조각만 쓰고 모두 없으면 null", () => {
    expect(
      studentSummaryLine({
        gradeLabel: "고1",
        semester: null,
        career: "의사",
        department: null,
        universities: [],
      }),
    ).toBe("고1, 의사 희망");
    expect(studentSummaryLine(null)).toBeNull();
  });
});
