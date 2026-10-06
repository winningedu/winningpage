import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { deriveGrowthSteps, type GrowthStep } from "./deriveGrowthSteps";
import GrowthSidebar from "./GrowthSidebar";
import { GROWTH_PATHS } from "./growthPaths";

const STEPS = deriveGrowthSteps({
  screenStep: 2,
  openReport: { status: "draft", currentStep: 0, answered: 3, total: 24 },
  latestCompletedReportId: null,
});

function render({
  pathname = GROWTH_PATHS.survey,
  studentName = "QA학생",
  gradeLabel = "고2",
  steps = STEPS,
}: {
  pathname?: string;
  studentName?: string | null;
  gradeLabel?: string | null;
  steps?: GrowthStep[];
} = {}) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[pathname]}>
      <SidebarProvider>
        <GrowthSidebar
          studentName={studentName}
          gradeLabel={gradeLabel}
          steps={steps}
        />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

function anchors(html: string) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    attrs: m[1] as string,
    text: (m[2] as string).replace(/<[^>]*>/g, "").trim(),
  }));
}

describe("상단 학생 표시", () => {
  test("이름과 학년을 보여 준다", () => {
    const html = render();
    expect(html).toContain("QA학생의 성장설계");
    expect(html).toContain("고2");
  });

  test("이름이 없으면 그 줄을 그리지 않는다", () => {
    const html = render({ studentName: null });
    expect(html).not.toContain("의 성장설계");
  });

  test("학년이 없으면 학년 줄을 그리지 않는다", () => {
    const html = render({ gradeLabel: null });
    expect(html).toContain("QA학생의 성장설계");
    expect(html).not.toContain("고2");
  });
});

describe("메뉴", () => {
  test("성장설계와 지난 리포트 두 항목이 올바른 경로를 가진다", () => {
    const menu = anchors(render()).filter((a) =>
      ["성장설계", "지난 리포트"].includes(a.text),
    );
    expect(menu.map((a) => a.text)).toEqual(["성장설계", "지난 리포트"]);
    expect(menu[0]?.attrs).toContain(`href="${GROWTH_PATHS.home}"`);
    expect(menu[1]?.attrs).toContain(`href="${GROWTH_PATHS.reports}"`);
  });

  test("흐름 안 화면에서는 성장설계만 현재 페이지다", () => {
    const current = anchors(render({ pathname: GROWTH_PATHS.survey })).filter(
      (a) => /aria-current="page"/.test(a.attrs),
    );
    expect(current.map((a) => a.text)).toEqual(["성장설계"]);
  });

  test("지난 리포트 목록에서는 지난 리포트만 현재 페이지다", () => {
    const current = anchors(render({ pathname: GROWTH_PATHS.reports })).filter(
      (a) => /aria-current="page"/.test(a.attrs),
    );
    expect(current.map((a) => a.text)).toEqual(["지난 리포트"]);
  });

  test("리포트 상세는 흐름 5단계이므로 성장설계가 현재 페이지다", () => {
    const current = anchors(
      render({ pathname: GROWTH_PATHS.report("r1") }),
    ).filter((a) => /aria-current="page"/.test(a.attrs));
    expect(current.map((a) => a.text)).toEqual(["성장설계"]);
  });
});

describe("진행단계", () => {
  test("6단계를 순서대로 그린다", () => {
    const html = render();
    const order = [
      "시작",
      "학생 조사",
      "활동 선택",
      "리포트 생성",
      "리포트",
      "실행계획",
    ].map((label) => html.indexOf(`>${label}<`, html.indexOf("진행단계")));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("현재 단계에만 aria-current step 이 붙는다", () => {
    const html = render();
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  });

  test("완료 단계는 체크 아이콘과 완료 안내를 가진다", () => {
    const html = render();
    expect(html).toContain("<svg");
    expect(html).toContain("완료");
  });

  test("들어갈 수 있는 단계는 링크이고 잠긴 단계는 링크가 아니다", () => {
    const stepAnchors = anchors(render()).map((a) => a.text);
    // 시작(done)은 링크, 활동 선택(locked)은 링크가 아니다.
    expect(stepAnchors.some((t) => t.startsWith("시작"))).toBe(true);
    expect(stepAnchors.some((t) => t.startsWith("활동 선택"))).toBe(false);
  });

  test("현재 단계는 링크가 아니다", () => {
    expect(anchors(render()).some((a) => a.text.startsWith("학생 조사"))).toBe(
      false,
    );
  });
});
