import { describe, expect, it } from "vitest";
import { INQUIRY_PATHS } from "@/components/inquiry/inquiryPaths";
import type { ReportsList } from "@/lib/inquiry/types";
import {
  applyFilters,
  buildReportRows,
  formatReportDate,
  resumePath,
  STATUS_FILTER_OPTIONS,
  subjectFilterOptions,
} from "./reportsLogic";

function list(over: Partial<ReportsList> = {}): ReportsList {
  return {
    ok: true,
    items: [
      {
        sessionId: "s1",
        completedAt: "2026-09-30T15:30:00.000Z",
        subject: "생명과학",
        topicTitle: "효소 활성 탐구",
        linkKind: "followup",
        score: 82,
        label: "ready_with_minor_edits",
      },
      {
        sessionId: "s2",
        completedAt: "2026-09-10T00:00:00.000Z",
        subject: "수학",
        topicTitle: "미분 응용",
        linkKind: "transfer",
        score: 71.26,
        label: "revision_needed",
      },
    ],
    open: null,
    archived: [],
    ...over,
  };
}

describe("formatReportDate", () => {
  it("서울 날짜 기준 YYYY.MM.DD 로 만든다", () => {
    expect(formatReportDate("2026-09-30T15:30:00.000Z")).toBe("2026.10.01");
  });
  it("해석할 수 없으면 대시를 낸다", () => {
    expect(formatReportDate("nope")).toBe("-");
  });
});

describe("resumePath", () => {
  it("currentStep 을 단계 경로로 매핑한다", () => {
    expect(resumePath(1)).toBe(INQUIRY_PATHS.home);
    expect(resumePath(2)).toBe(INQUIRY_PATHS.topics);
    expect(resumePath(3)).toBe(INQUIRY_PATHS.design);
    expect(resumePath(4)).toBe(INQUIRY_PATHS.write);
    expect(resumePath(5)).toBe(INQUIRY_PATHS.evaluate);
    expect(resumePath(6)).toBe(INQUIRY_PATHS.finalize);
  });
});

describe("buildReportRows", () => {
  it("확정 행은 연계 방식 라벨, 소수 첫째 자리 점수, 열기 동작을 가진다", () => {
    const rows = buildReportRows(list());
    expect(rows[0]).toMatchObject({
      sessionId: "s1",
      date: "2026.10.01",
      subject: "생명과학",
      topic: "효소 활성 탐구",
      linkKind: "후속형",
      score: "82.0",
      statusKey: "confirmed",
      statusLabel: "확정",
      actionLabel: "열기",
      to: INQUIRY_PATHS.report("s1"),
    });
    expect(rows[1]?.score).toBe("71.3");
    expect(rows[1]?.linkKind).toBe("전이형");
  });

  it("열린 세션은 맨 위에 작성 중 행으로 들어가고 이어서 하기 경로를 가진다", () => {
    const rows = buildReportRows(
      list({
        open: {
          sessionId: "o1",
          currentStep: 4,
          subject: "물리",
          topicTitle: null,
          lastActivityAt: "2026-10-05T00:00:00.000Z",
        },
      }),
    );
    expect(rows[0]).toMatchObject({
      sessionId: "o1",
      statusKey: "open",
      statusLabel: "작성 중",
      score: "-",
      topic: "-",
      linkKind: "-",
      actionLabel: "이어서 하기",
      to: INQUIRY_PATHS.write,
    });
  });

  it("보관 행은 만료 또는 종결이고 이어하기 불가 안내만 있다", () => {
    const rows = buildReportRows(
      list({
        items: [],
        archived: [
          {
            sessionId: "a1",
            subject: "화학",
            topicTitle: "산화",
            lastActivityAt: "2026-08-01T00:00:00.000Z",
            terminal: null,
          },
          {
            sessionId: "a2",
            subject: "화학",
            topicTitle: null,
            lastActivityAt: "2026-08-02T00:00:00.000Z",
            terminal: { reason: "attempts", mode: "design" },
          },
        ],
      }),
    );
    expect(rows[0]).toMatchObject({
      statusKey: "archived",
      statusLabel: "만료",
      actionLabel: null,
      to: null,
    });
    expect(rows[0]?.note).toContain("이어서 할 수 없");
    expect(rows[1]?.statusLabel).toBe("종결");
    expect(rows[1]?.topic).toBe("-");
  });
});

describe("필터", () => {
  const rows = buildReportRows(
    list({
      open: {
        sessionId: "o1",
        currentStep: 2,
        subject: "수학",
        topicTitle: null,
        lastActivityAt: "2026-10-05T00:00:00.000Z",
      },
    }),
  );

  it("과목 선택지는 전체 + distinct 과목이다", () => {
    expect(subjectFilterOptions(rows)).toEqual(["전체", "수학", "생명과학"]);
  });

  it("상태 선택지는 전체, 확정, 작성 중, 만료다", () => {
    expect(STATUS_FILTER_OPTIONS.map((o) => o.label)).toEqual([
      "전체",
      "확정",
      "작성 중",
      "만료",
    ]);
  });

  it("과목과 상태를 함께 건다", () => {
    expect(applyFilters(rows, "전체", "all")).toHaveLength(3);
    expect(applyFilters(rows, "수학", "all")).toHaveLength(2);
    expect(applyFilters(rows, "수학", "confirmed")).toHaveLength(1);
    expect(applyFilters(rows, "생명과학", "open")).toHaveLength(0);
  });

  it("만료 필터는 종결 행도 포함한다", () => {
    const r = buildReportRows(
      list({
        items: [],
        archived: [
          {
            sessionId: "a2",
            subject: "화학",
            topicTitle: null,
            lastActivityAt: "2026-08-02T00:00:00.000Z",
            terminal: { reason: "x", mode: "design" },
          },
        ],
      }),
    );
    expect(applyFilters(r, "전체", "archived")).toHaveLength(1);
  });
});
