import { describe, expect, it } from "vitest";
import type {
  LastTerminal,
  OpenReportSummary,
  ReportListItem,
  StepProgress,
} from "@/lib/growth/api";
import { GROWTH_PATHS } from "../growthPaths";
import {
  deriveOpenCard,
  openTarget,
  planAvailability,
  sortReportItems,
  terminalNotice,
} from "./reportsLogic";

function progress(doneCount: number): StepProgress[] {
  return Array.from({ length: 8 }, (_, i) => ({
    step: i + 1,
    label: `단계${i + 1}`,
    status: i < doneCount ? "done" : "pending",
    attempts: 0,
  }));
}

function open(partial: Partial<OpenReportSummary> = {}): OpenReportSummary {
  return {
    id: "r-open",
    status: "draft",
    currentStep: 0,
    track: null,
    progress: progress(0),
    nextStep: 1,
    terminal: null,
    lastActivityAt: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

function item(
  id: string,
  partial: Partial<ReportListItem> = {},
): ReportListItem {
  return {
    id,
    status: "completed",
    track: null,
    issuedAt: null,
    theme: null,
    lastActivityAt: "2026-01-01T00:00:00.000Z",
    plan: null,
    ...partial,
  };
}

describe("openTarget", () => {
  it("생성이 시작되기 전(currentStep 0)이면 학생 조사로 보낸다", () => {
    expect(openTarget(open({ currentStep: 0 }))).toBe(GROWTH_PATHS.survey);
  });

  it("생성이 시작됐으면(currentStep 1 이상) 리포트 생성 화면으로 보낸다", () => {
    expect(openTarget(open({ currentStep: 3, status: "in_progress" }))).toBe(
      GROWTH_PATHS.generate,
    );
  });
});

describe("deriveOpenCard", () => {
  it("currentStep 0 이면 작성 중, 진행 단계는 학생 조사 중이다", () => {
    const card = deriveOpenCard(open());
    expect(card.statusLabel).toBe("작성 중");
    expect(card.progressLabel).toBe("학생 조사 중");
  });

  it("생성 중이면 완료된 단계 수를 8단계 중 N 으로 보여 준다", () => {
    const card = deriveOpenCard(
      open({ currentStep: 4, status: "in_progress", progress: progress(3) }),
    );
    expect(card.statusLabel).toBe("생성 중");
    expect(card.progressLabel).toBe("8단계 중 3단계 완료");
  });
});

describe("sortReportItems", () => {
  it("발행일 내림차순이고 발행일이 없으면 뒤로 간다", () => {
    const sorted = sortReportItems([
      item("a", { issuedAt: "2026-03-10T00:00:00.000Z" }),
      item("b", { issuedAt: null }),
      item("c", { issuedAt: "2026-11-14T00:00:00.000Z" }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("원본 배열을 바꾸지 않는다", () => {
    const src = [item("a"), item("b")];
    sortReportItems(src);
    expect(src.map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("planAvailability", () => {
  it("최신 회차만 실행계획 경로가 활성이다", () => {
    expect(planAvailability(0)).toEqual({
      enabled: true,
      href: GROWTH_PATHS.plan,
    });
    expect(planAvailability(1).enabled).toBe(false);
  });
});

describe("terminalNotice", () => {
  const terminal: LastTerminal = {
    reportId: "r1",
    reason: "8단계 검증 실패",
    at: "2026-09-30T00:00:00.000Z",
    step: 8,
  };

  it("종결 기록이 없으면 안내하지 않는다", () => {
    expect(terminalNotice(null, null)).toBeNull();
  });

  it("종결 기록이 있으면 사유와 시각을 돌려준다", () => {
    expect(terminalNotice(terminal, null)).toEqual({
      reason: "8단계 검증 실패",
      at: "2026-09-30T00:00:00.000Z",
    });
  });

  it("그 뒤에 새 미완 회차가 시작돼 있으면 안내하지 않는다", () => {
    expect(
      terminalNotice(
        terminal,
        open({ lastActivityAt: "2026-10-02T00:00:00.000Z" }),
      ),
    ).toBeNull();
  });
});
