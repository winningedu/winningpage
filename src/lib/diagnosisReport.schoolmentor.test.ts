// 스쿨멘토 학습진단 리포트: 콜멘토를 추천하지 않고 서비스 이름에 '위닝 '을 붙이지 않는다(결정 107.11, 107.12).
import { afterEach, describe, expect, test, vi } from "vitest";
import { makeInput } from "./diagnosisScoringTestFixtures.ts";

async function loadBuildReport(schoolmentor: boolean) {
  vi.resetModules();
  vi.doMock("@/config/site", () => ({
    site: {
      brandName: schoolmentor ? "스쿨멘토" : "위닝에듀",
      features: {
        stripWinningPrefix: schoolmentor,
        callmentor: !schoolmentor,
      },
    },
  }));
  return (await import("./diagnosisReport.ts")).buildReport;
}

afterEach(() => {
  vi.doUnmock("@/config/site");
  vi.resetModules();
});

const callMentorFirst = (gradeLevel: string, diagnosedAt: string | null) =>
  makeInput({
    meta: { schemaVersion: "test", diagnosedAt },
    profile: { name: null, gradeLevel, schoolType: null },
    obstacles: ["OBS_10", "OBS_11", "OBS_12", "OBS_01", "OBS_02", "OBS_03"],
    wishes: ["WISH_08", "WISH_09", "WISH_10"],
  });

describe("스쿨멘토 리포트", () => {
  test("추천 목록에 콜멘토가 없고 이름에 '위닝 '이 없다", async () => {
    const buildReport = await loadBuildReport(true);

    const { recommendations } = buildReport(callMentorFirst("M3", null));

    expect(recommendations.length).toBeGreaterThan(0);
    for (const card of recommendations) {
      expect(card.name).not.toContain("콜멘토");
      expect(card.name).not.toContain("위닝");
    }
    expect(recommendations[0]?.name).toBe("목표관리");
  });

  test("중3 안내는 목표관리만 말한다", async () => {
    const buildReport = await loadBuildReport(true);

    expect(buildReport(callMentorFirst("M3", null)).notices.serviceLimit).toBe(
      "중학교 3학년은 목표관리가 추천 대상입니다. 나머지 서비스는 고등학교 활동을 전제로 하므로 진학 이후에 안내드립니다.",
    );
  });

  test("고3 6월 이후 안내는 목표관리만 말한다", async () => {
    const buildReport = await loadBuildReport(true);

    expect(
      buildReport(callMentorFirst("H3", "2026-07-10T00:00:00Z")).notices
        .serviceLimit,
    ).toBe(
      "고등학교 3학년 6월 이후에는 남은 기간 안에 바로 실행할 수 있는 목표관리를 우선 안내드립니다.",
    );
  });
});

describe("위닝 리포트", () => {
  test("콜멘토 추천과 안내 문구가 그대로다", async () => {
    const buildReport = await loadBuildReport(false);

    const m3 = buildReport(callMentorFirst("M3", null));

    expect(m3.recommendations.map((card) => card.name)).toContain(
      "위닝 콜멘토",
    );
    expect(m3.notices.serviceLimit).toContain(
      "위닝 목표관리와 위닝 콜멘토 두 가지",
    );
    expect(
      buildReport(callMentorFirst("H3", "2026-07-10T00:00:00Z")).notices
        .serviceLimit,
    ).toContain("위닝 목표관리와 위닝 콜멘토 두 가지");
  });
});
