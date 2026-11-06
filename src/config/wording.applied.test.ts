// 스쿨멘토에서 화면에 보이는 고지, 서비스 이름 문구에 '위닝 ' 접두어가 남지 않는지 확인한다(결정 2, 사 #4).
import { describe, expect, it, vi } from "vitest";

async function loadAsSchoolmentor<T>(path: string): Promise<T> {
  vi.resetModules();
  vi.doMock("@/config/site", () => ({
    site: { features: { stripWinningPrefix: true } },
  }));
  return (await import(/* @vite-ignore */ path)) as T;
}

describe("고지 문구 - 스쿨멘토", () => {
  it("심화탐구 고지는 '서비스 내부 기준'을 쓴다", async () => {
    const { NOTICES } = await loadAsSchoolmentor<{ NOTICES: string[] }>(
      "@/lib/inquiry/labels",
    );

    expect(NOTICES).toContain(
      "평가는 서비스 내부 기준이에요. 학교 성적, 학생부 평가, 합격 가능성을 예측하지 않아요.",
    );
  });

  it("자기평가 고지는 '서비스 내부 기준'을 쓴다", async () => {
    const { SELFEVAL_NOTICE_LINES } = await loadAsSchoolmentor<{
      SELFEVAL_NOTICE_LINES: string[];
    }>("@/components/selfeval/SelfevalNotice");

    expect(SELFEVAL_NOTICE_LINES).toContain(
      "점수와 판정은 서비스 내부 기준이에요. 학교 채점 결과나 학생부 평가 예측이 아니에요",
    );
  });

  it("성장설계 고지와 리포트 고지는 '서비스 내부 기준'을 쓴다", async () => {
    const { GROWTH_NOTICE_LINES } = await loadAsSchoolmentor<{
      GROWTH_NOTICE_LINES: string[];
    }>("@/pages/growth/GrowthNotice");
    const { REPORT_NOTICES } = await loadAsSchoolmentor<{
      REPORT_NOTICES: string[];
    }>("@/components/growth/report/reportLogic");
    const line =
      "이 진단은 서비스 내부 기준이에요. 합격 가능성이나 학교 평가를 예측하지 않아요.";

    expect(GROWTH_NOTICE_LINES).toContain(line);
    expect(REPORT_NOTICES).toContain(line);
  });
});

describe("서비스 이름 라벨 - 스쿨멘토", () => {
  it("성장설계 계획 화면은 자기평가서, 심화탐구 이름에 '위닝 '을 붙이지 않는다", async () => {
    const { PROGRAM_LABELS, handoffButtonLabel } = await loadAsSchoolmentor<
      typeof import("@/components/growth/plan/planLogic")
    >("@/components/growth/plan/planLogic");

    expect(PROGRAM_LABELS.self).toBe("자기평가서");
    expect(PROGRAM_LABELS.deep).toBe("심화탐구");
    expect(handoffButtonLabel("self")).toBe("자기평가서에서 하기");
    expect(handoffButtonLabel("deep")).toBe("심화탐구에서 하기");
  });

  it("자기평가 활동 출처 이름에 '위닝 '을 붙이지 않는다", async () => {
    const { sourceLabel } = await loadAsSchoolmentor<
      typeof import("@/components/selfeval/activities/activitiesLogic")
    >("@/components/selfeval/activities/activitiesLogic");

    expect(sourceLabel("performance")).toBe("수행평가");
    expect(sourceLabel("deep")).toBe("심화탐구");
    expect(sourceLabel("self")).toBe("자기평가서");
  });
});
