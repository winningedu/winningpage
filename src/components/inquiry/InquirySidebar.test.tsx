import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { type InquiryStep, deriveInquirySteps } from "./deriveInquirySteps";
import { INQUIRY_PATHS } from "./inquiryPaths";
import InquirySidebar from "./InquirySidebar";

const STEPS = deriveInquirySteps({
  screenStep: 2,
  session: {
    status: "draft",
    currentStep: 2,
    selectedTopicId: null,
    designReportId: null,
    latestEvaluationId: null,
  },
});

function render({
  pathname = INQUIRY_PATHS.topics,
  studentName = "QA학생",
  gradeLabel = "고2",
  steps = STEPS,
}: {
  pathname?: string;
  studentName?: string | null;
  gradeLabel?: string | null;
  steps?: InquiryStep[];
} = {}) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[pathname]}>
      <SidebarProvider>
        <InquirySidebar
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
  test("OO의 심화탐구와 학년을 보여 준다", () => {
    const html = render();
    expect(html).toContain("QA학생의 심화탐구");
    expect(html).toContain("고2");
  });

  test("이름이 없으면 이름 줄을 그리지 않는다", () => {
    expect(render({ studentName: null })).not.toContain("의 심화탐구");
  });

  test("학년이 없으면 학년 줄을 그리지 않는다", () => {
    const html = render({ gradeLabel: null });
    expect(html).toContain("QA학생의 심화탐구");
    expect(html).not.toContain("고2");
  });
});

describe("메뉴", () => {
  test("심화탐구와 보관함 두 항목이 올바른 경로를 가진다", () => {
    const menu = anchors(render()).filter((a) =>
      ["심화탐구", "보관함"].includes(a.text),
    );
    expect(menu.map((a) => a.text)).toEqual(["심화탐구", "보관함"]);
    expect(menu[0]?.attrs).toContain(`href="${INQUIRY_PATHS.home}"`);
    expect(menu[1]?.attrs).toContain(`href="${INQUIRY_PATHS.reports}"`);
  });

  test("흐름 안 화면에서는 심화탐구만 현재 페이지다", () => {
    const current = anchors(render()).filter((a) =>
      /aria-current="page"/.test(a.attrs),
    );
    expect(current.map((a) => a.text)).toEqual(["심화탐구"]);
  });

  test("보관함 목록과 상세에서는 보관함만 현재 페이지다", () => {
    for (const pathname of [
      INQUIRY_PATHS.reports,
      INQUIRY_PATHS.report("s1"),
    ]) {
      const current = anchors(render({ pathname })).filter((a) =>
        /aria-current="page"/.test(a.attrs),
      );
      expect(current.map((a) => a.text)).toEqual(["보관함"]);
    }
  });
});

describe("진행단계", () => {
  test("6단계를 순서대로 그린다", () => {
    const html = render();
    const start = html.indexOf("진행단계");
    const order = [
      "정보 입력",
      "주제 추천",
      "설계 리포트",
      "보고서 작성",
      "평가 리포트",
      "확정과 적립",
    ].map((label) => html.indexOf(`>${label}<`, start));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("현재 단계에만 aria-current step 이 붙는다", () => {
    expect(render().match(/aria-current="step"/g)).toHaveLength(1);
  });

  test("완료 단계는 체크 아이콘과 완료 안내를 가진다", () => {
    const html = render();
    expect(html).toContain("<svg");
    expect(html).toContain("완료");
  });

  test("들어갈 수 있는 단계는 링크이고 잠긴 단계와 현재 단계는 링크가 아니다", () => {
    const texts = anchors(render()).map((a) => a.text);
    expect(texts.some((t) => t.startsWith("정보 입력"))).toBe(true);
    expect(texts.some((t) => t.startsWith("설계 리포트"))).toBe(false);
    expect(texts.some((t) => t.startsWith("주제 추천"))).toBe(false);
  });
});
