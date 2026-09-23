import { describe, expect, it } from "vitest";
import { buildHeroNarrative } from "./insights.js";

describe("buildHeroNarrative — 기록 없음(QA 2차 시트 행60)", () => {
  it("지난주 기간이고 기록이 없으면 고객사 요청 문구를 지난주 기간으로 안내한다", () => {
    const text = buildHeroNarrative({
      period: "weekly",
      totalStudyHours: 0,
      idealRate: 0,
      minRate: 0,
      completionScore: 0,
      recordDays: 0,
      elapsedDays: 7,
      periodStart: "2026-08-30",
      periodEnd: "2026-09-06",
      nowYmd: "2026-09-10",
    });

    expect(text).toBe(
      "지난주(2026.8.30~2026.9.6) 학습목표 또는 실행내역의 입력 내용이 없습니다. 학습목표의 관리를 위해서는 지속적인 목표관리 체크 및 현황 입력이 중요합니다.",
    );
  });

  it("진행 중인 이번 주 기간이고 기록이 없으면 '이번 주' 문구로 안내한다", () => {
    const text = buildHeroNarrative({
      period: "weekly",
      totalStudyHours: 0,
      idealRate: 0,
      minRate: 0,
      completionScore: 0,
      recordDays: 0,
      elapsedDays: 3,
      periodStart: "2026-09-21",
      periodEnd: "2026-09-27",
      nowYmd: "2026-09-23",
    });

    expect(text).toBe(
      "이번 주(2026.9.21~2026.9.27) 학습목표 또는 실행내역의 입력 내용이 없습니다. 학습목표의 관리를 위해서는 지속적인 목표관리 체크 및 현황 입력이 중요합니다.",
    );
  });
});
