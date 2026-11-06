// 스쿨멘토는 사이드바 그룹 제목을 명세 표기 '진행 단계'(띄어쓰기)로 보여준다(결정 14, 사 #57-q1).
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";

vi.mock("@/config/site", () => ({
  site: { features: { stripWinningPrefix: true } },
}));

const { SidebarProvider } = await import("@/components/ui/sidebar");
const { deriveGrowthSteps } = await import("./deriveGrowthSteps");
const { default: GrowthSidebar } = await import("./GrowthSidebar");
const { GROWTH_PATHS } = await import("./growthPaths");

test("성장설계 사이드바 제목은 '진행 단계'다", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={[GROWTH_PATHS.survey]}>
      <SidebarProvider>
        <GrowthSidebar
          studentName="QA학생"
          gradeLabel="고2"
          steps={deriveGrowthSteps({
            screenStep: 2,
            openReport: {
              status: "draft",
              currentStep: 0,
              answered: 3,
              total: 24,
            },
            latestCompletedReportId: null,
          })}
        />
      </SidebarProvider>
    </MemoryRouter>,
  );

  expect(html).toContain(">진행 단계<");
  expect(html).not.toContain(">진행단계<");
});
