import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import {
  deriveSelfevalSteps,
  type SelfevalStepItem,
} from "./deriveSelfevalSteps";
import SelfevalSidebar from "./SelfevalSidebar";
import { SELFEVAL_PATHS } from "./selfevalPaths";

const STEPS = deriveSelfevalSteps({
  screenStep: 3,
  openSession: { id: "s1", currentStep: 1 },
});

function render({
  pathname = SELFEVAL_PATHS.activities("s1"),
  studentName = "QA학생",
  gradeLabel = "고2",
  steps = STEPS,
}: {
  pathname?: string;
  studentName?: string | null;
  gradeLabel?: string | null;
  steps?: SelfevalStepItem[];
} = {}) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[pathname]}>
      <SidebarProvider>
        <SelfevalSidebar
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
    expect(html).toContain("QA학생의 자기평가서");
    expect(html).toContain("고2");
  });

  test("이름이 없으면 이름 줄을, 학년이 없으면 학년 줄을 그리지 않는다", () => {
    expect(render({ studentName: null })).not.toContain("의 자기평가서");
    expect(render({ gradeLabel: null })).not.toContain("고2");
  });
});

describe("메뉴", () => {
  test("자기평가서 작성과 보관함 두 항목이 올바른 경로를 가진다", () => {
    const menu = anchors(render()).filter((a) =>
      ["자기평가서 작성", "보관함"].includes(a.text),
    );
    expect(menu.map((a) => a.text)).toEqual(["자기평가서 작성", "보관함"]);
    expect(menu[0]?.attrs).toContain(`href="${SELFEVAL_PATHS.home}"`);
    expect(menu[1]?.attrs).toContain(`href="${SELFEVAL_PATHS.archive}"`);
  });

  test("흐름 안 화면에서는 자기평가서 작성만 현재 페이지다", () => {
    const current = anchors(render()).filter((a) =>
      /aria-current="page"/.test(a.attrs),
    );
    expect(current.map((a) => a.text)).toEqual(["자기평가서 작성"]);
  });

  test("보관함에서는 보관함만 현재 페이지다", () => {
    const current = anchors(
      render({ pathname: SELFEVAL_PATHS.archive }),
    ).filter((a) => /aria-current="page"/.test(a.attrs));
    expect(current.map((a) => a.text)).toEqual(["보관함"]);
  });
});

describe("진행단계", () => {
  test("6단계를 순서대로 그린다", () => {
    const html = render();
    const order = [
      "시작",
      "기본 입력",
      "활동 선택",
      "분석 확인",
      "생성 결과",
      "검증과 저장",
    ].map((label) => html.indexOf(`>${label}<`, html.indexOf("진행단계")));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("현재 단계에만 aria-current step 이 붙고 링크가 아니다", () => {
    const html = render();
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(anchors(html).some((a) => a.text.startsWith("활동 선택"))).toBe(
      false,
    );
  });

  test("끝난 단계는 링크이고 잠긴 단계는 링크가 아니다", () => {
    const texts = anchors(render()).map((a) => a.text);
    expect(texts.some((t) => t.startsWith("기본 입력"))).toBe(true);
    expect(texts.some((t) => t.startsWith("분석 확인"))).toBe(false);
  });
});
