import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => navigateMock,
}));

import SelfAssessment from "./SelfAssessment";

// 금지 문자: U+2013, U+2014, U+00B7, U+318D, U+2190 부터 U+21FF. 리터럴로 쓰면 검사에 걸려 이스케이프로 만든다.
const FORBIDDEN_CHARS = /[\u2013\u2014\u00B7\u318D\u2190-\u21FF]/;

function renderPage() {
  render(
    <MemoryRouter>
      <SelfAssessment />
    </MemoryRouter>,
  );
}

describe("SelfAssessment 소개 랜딩", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it("섹션 헤딩 8개가 렌더된다", () => {
    renderPage();
    const names: (string | RegExp)[] = [
      /4단계 프로세스/,
      "다섯 영역으로 코칭합니다",
      /어디서 막히든/,
      /차근차근/,
      /확인하세요/,
      /정리됩니다/,
      "위닝 자기평가서",
      /모았습니다/,
    ];
    for (const name of names) {
      expect(screen.getByRole("heading", { name })).toBeTruthy();
    }
  });

  it("탭을 전환하면 해당 영역 카드가 보인다", () => {
    renderPage();
    expect(screen.getByText("문항 의도 파악")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "내용정리" }));
    expect(screen.getByText("활동・경험 정리")).toBeTruthy();
    expect(screen.queryByText("문항 의도 파악")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "피드백" }));
    expect(screen.getByText("완성도 점검")).toBeTruthy();
  });

  it("FAQ 답변을 펼치면 보이고 확인 요청 문구가 없다", () => {
    renderPage();
    fireEvent.click(
      screen.getByRole("button", { name: "AI가 대신 작성해 주나요?" }),
    );
    const answer = screen.getByText(/실제 작성은 학생 본인이 수행합니다/);
    expect(answer.closest("[hidden]")).toBeNull();
    expect(document.body.textContent).not.toContain("[대표님 확인]");
  });

  it("미리보기 점을 누르면 화면이 바뀐다", () => {
    renderPage();
    expect(screen.getByRole("img", { name: /^활동 선택 화면/ })).toBeTruthy();

    const dot = screen.getByRole("button", { name: "2번째 화면" });
    fireEvent.click(dot);
    expect(screen.getByRole("img", { name: /^분석 확인 화면/ })).toBeTruthy();
    expect(dot.getAttribute("aria-pressed")).toBe("true");
  });

  it("히어로 CTA 는 /app/selfeval 로 이동한다", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "지금 시작하기" }));
    expect(navigateMock).toHaveBeenLastCalledWith("/app/selfeval");
    expect(navigateMock).toHaveBeenCalledTimes(1);
  });

  it("하단 무료 체험 섹션과 버튼이 없다", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: "무료 체험 시작" })).toBeNull();
    expect(document.body.textContent).not.toContain("나만의 강점을 더 빛나게");
  });

  it("헤드 카피를 요청대로 보여준다", () => {
    renderPage();
    expect(
      screen.getByText("자기평가서 작성 지원 프로그램"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/나만의 강점을 구조화, 학생이 스스로 완성하도록/),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("구조화해,");
  });

  it("미리보기 인디케이터는 비활성 점도 배경과 구분되는 색을 쓴다", () => {
    renderPage();
    const inactive = screen.getByRole("button", { name: "2번째 화면" });
    expect(inactive.className).not.toContain("bg-line");
    expect(inactive.className).toContain("h-3");
  });

  it("금지 문자가 본문에 없다", () => {
    renderPage();
    expect(document.body.textContent).not.toMatch(FORBIDDEN_CHARS);
  });
});
