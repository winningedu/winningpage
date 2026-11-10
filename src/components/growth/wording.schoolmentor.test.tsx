// 성장설계 앱 화면의 '위닝' 브랜드 말이 스쿨멘토에서 '스쿨멘토'로 보이는지, 위닝에서는 그대로인지 확인한다(결정 107.11).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

async function setSite(stripWinningPrefix: boolean) {
  vi.resetModules();
  vi.doMock("@/config/site", () => ({
    site: { brandName: "스쿨멘토", features: { stripWinningPrefix } },
  }));
  vi.doMock("@/context/SessionContext", () => ({
    useSession: () => ({ userId: "u1" }),
  }));
  vi.doMock("@/context/ToastContext", () => ({
    useToast: () => ({ error: vi.fn(), success: vi.fn() }),
  }));
}

afterEach(() => {
  cleanup();
  vi.doUnmock("@/config/site");
});

describe.each([
  [true, "스쿨멘토"],
  [false, "위닝"],
])("성장설계 앱 문구 (stripWinningPrefix=%s)", (strip, brand) => {
  it("OverviewCard 행 이름", async () => {
    await setSite(strip);
    const { OverviewCard } = await import("./collect/OverviewCard");
    render(
      <OverviewCard
        bySource={{
          performance: 1,
          self: 0,
          deep: 0,
          manual: 0,
          upload: 0,
          total: 1,
        }}
        warnings={[]}
      />,
    );

    expect(screen.getByText(`${brand} 저장 활동`)).toBeTruthy();
  });

  it("PreCheckCard 활동 라벨", async () => {
    await setSite(strip);
    const { default: PreCheckCard } = await import("./start/PreCheckCard");
    render(
      <PreCheckCard
        overview={
          {
            total: 1,
            bySource: {},
            byGroup: { curricular: 1, extracurricular: 0 },
            firstYear: { level: "low", count: 0 },
          } as never
        }
        questionCount={24}
      />,
    );

    expect(screen.getByText(`${brand}에 저장된 활동`)).toBeTruthy();
  });

  it("ProfileCard 안내 문구", async () => {
    await setSite(strip);
    const { default: ProfileCard } = await import("./start/ProfileCard");
    render(
      <ProfileCard
        values={{
          schoolType: null,
          admissionYear: null,
          grade: null,
          semester: null,
          career: null,
          department: null,
          universities: [],
        }}
        usedInitial={false}
        onSaved={async () => {}}
      />,
    );

    expect(
      screen.getByText(
        `처음 한 번만 적으면 다른 ${brand} 서비스에서도 함께 써요.`,
      ),
    ).toBeTruthy();
  });

  it("ManualActivityCard 설명", async () => {
    await setSite(strip);
    const { ManualActivityCard } = await import("./collect/ManualActivityCard");
    render(
      <ManualActivityCard
        userId="u1"
        manualActivities={[]}
        onChanged={() => {}}
      />,
    );

    expect(
      screen.getByText(
        `${brand}에 없는 활동을 직접 적어요. 집계와 A부터 E 판정에 함께 써요.`,
      ),
    ).toBeTruthy();
  });

  it("HandoffModal 제목", async () => {
    await setSite(strip);
    const { default: HandoffModal } = await import("./plan/HandoffModal");
    render(
      <HandoffModal
        handoff={
          {
            reportId: "r1",
            itemId: "i1",
            program: "self",
            theme: null,
            currentGrade: null,
            stage: null,
            subtheme: null,
            condition: { axis: null, title: "조건", description: null },
          } as never
        }
        issuedAt={null}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );

    expect(
      screen.getByText(
        strip ? "자기평가로 이동할까요?" : "위닝 자기평가서로 이동할까요?",
      ),
    ).toBeTruthy();
  });

  it("단계 이름, 리포트 파트 제목, 진행 메모", async () => {
    await setSite(strip);
    const { STEP_LABELS } = await import("./generate/stepLabels");
    const { PART_TITLES } = await import("./report/reportLogic");
    const { progressNote } = await import("./plan/planLogic");

    expect(STEP_LABELS[6]).toBe(
      strip ? "A부터 E 5축 진단" : "위닝 A부터 E 5축 진단",
    );
    expect(PART_TITLES[2]).toBe(
      strip ? "2부 A부터 E 5축 진단" : "2부 위닝 A부터 E 5축 진단",
    );
    expect(progressNote({ program: "self" } as never, false)).toBe(
      `진행: 직접 체크. ${brand} 프로그램을 쓰지 않아도 하면 체크해요.`,
    );
  });

  it("표 섹션의 서버 메모", async () => {
    await setSite(strip);
    const { normalizeBody } = await import("./report/sectionBody");
    const view = normalizeBody({
      id: "2-1",
      part: 2,
      title: "t",
      format: "table",
      badge: null,
      status: "ok",
      evidenceCount: 0,
      body: {
        note: "위닝 내부 추정이에요.",
        rows: [{ label: "a", value: "b" }],
      },
      reason: null,
      formula: null,
    });

    expect(view.kind === "table" && view.note).toBe(
      strip ? "서비스 내부 추정이에요." : "위닝 내부 추정이에요.",
    );
  });
});
