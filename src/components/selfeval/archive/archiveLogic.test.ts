import { describe, expect, test } from "vitest";
import type { SessionListItem } from "@/lib/selfeval/types";
import {
  archiveOptions,
  archiveTitle,
  filterSessions,
  rowAction,
  rowMeta,
  STATE_LABELS,
  sessionState,
} from "./archiveLogic";

const item = (over: Partial<SessionListItem> = {}): SessionListItem => ({
  id: "s1",
  status: "in_progress",
  currentStep: 2,
  academicYear: 2026,
  semester: 1,
  area: "subject",
  subject: "수학",
  activityName: "설문 분석",
  score: null,
  completedAt: null,
  lastActivityAt: "2026-10-01T03:00:00Z",
  expired: false,
  discarded: false,
  terminal: null,
  ...over,
});

describe("sessionState", () => {
  test("플래그와 상태로 작성 중, 완료, 만료, 종결, 파기를 가른다", () => {
    expect(sessionState(item())).toBe("writing");
    expect(sessionState(item({ status: "draft" }))).toBe("writing");
    expect(sessionState(item({ status: "completed" }))).toBe("completed");
    expect(sessionState(item({ status: "archived", expired: true }))).toBe(
      "expired",
    );
    expect(
      sessionState(
        item({ status: "archived", terminal: { reason: "x", at: "t" } }),
      ),
    ).toBe("terminal");
    expect(sessionState(item({ status: "archived", discarded: true }))).toBe(
      "discarded",
    );
    expect(STATE_LABELS.discarded).toBe("파기");
  });
});

describe("archiveTitle", () => {
  test("과목, 없으면 활동명, 둘 다 없으면 이름 없이 자기평가서만", () => {
    expect(archiveTitle(item())).toBe("수학 자기평가서");
    expect(archiveTitle(item({ subject: null }))).toBe("설문 분석 자기평가서");
    expect(archiveTitle(item({ subject: null, activityName: null }))).toBe(
      "자기평가서",
    );
  });
});

describe("filterSessions, archiveOptions", () => {
  const list = [
    item({ id: "a", academicYear: 2026, semester: 1, area: "subject" }),
    item({
      id: "b",
      academicYear: 2025,
      semester: 2,
      area: "club",
      status: "completed",
    }),
  ];

  test("조건은 AND 로 걸리고 비어 있으면 전부 보인다", () => {
    expect(filterSessions(list, {}).map((x) => x.id)).toEqual(["a", "b"]);
    expect(
      filterSessions(list, { academicYear: 2025, state: "completed" }).map(
        (x) => x.id,
      ),
    ).toEqual(["b"]);
    expect(filterSessions(list, { area: "club", semester: 1 })).toEqual([]);
  });

  test("선택지는 목록에 있는 값만 학년도는 최신순으로 준다", () => {
    expect(archiveOptions(list)).toEqual({
      academicYears: [2026, 2025],
      semesters: [1, 2],
      areas: ["subject", "club"],
      states: ["writing", "completed"],
    });
  });
});

describe("rowAction", () => {
  test("작성 중은 이어쓰기, 완료는 다시 보기, 만료와 종결은 새로 시작, 파기는 없다", () => {
    expect(rowAction(item())).toBe("resume");
    expect(rowAction(item({ status: "completed" }))).toBe("view");
    expect(rowAction(item({ status: "archived", expired: true }))).toBe(
      "restart",
    );
    expect(
      rowAction(
        item({ status: "archived", terminal: { reason: "x", at: "t" } }),
      ),
    ).toBe("restart");
    expect(rowAction(item({ status: "archived", discarded: true }))).toBeNull();
  });
});

describe("rowMeta", () => {
  test("학년도 학기 영역 줄과 상태별 줄을 만든다", () => {
    expect(rowMeta(item())).toEqual([
      "2026학년도 1학기 교과",
      "3단계 활동 선택까지",
      "마지막 저장 2026.10.01",
    ]);
    expect(
      rowMeta(
        item({
          status: "completed",
          score: 82,
          completedAt: "2026-10-02T03:00:00Z",
        }),
      ),
    ).toEqual(["2026학년도 1학기 교과", "저장 2026.10.02", "점수 82점"]);
  });

  test("값이 없는 조각은 건너뛴다", () => {
    expect(
      rowMeta(item({ academicYear: null, semester: null, area: null })),
    ).toEqual(["3단계 활동 선택까지", "마지막 저장 2026.10.01"]);
  });
});
