import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock, getDemoAccessStateMock, alertMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  getDemoAccessStateMock: vi.fn(),
  alertMock: vi.fn(),
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => navigateMock,
}));

vi.mock("@/lib/demoAccess", () => ({
  getDemoAccessState: getDemoAccessStateMock,
}));

vi.mock("@/lib/paidServiceAccess", () => ({
  alertServiceNotReady: alertMock,
}));

import InDepthResearch from "./InDepthResearch";

function renderPage() {
  render(
    <MemoryRouter>
      <InDepthResearch />
    </MemoryRouter>,
  );
}

describe("InDepthResearch 히어로 CTA", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    getDemoAccessStateMock.mockReset();
    alertMock.mockReset();
  });

  it("로그인 상태면 /app/inquiry 로 이동한다", async () => {
    getDemoAccessStateMock.mockResolvedValue("user");
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "지금 시작하기" }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/app/inquiry"),
    );
    expect(alertMock).not.toHaveBeenCalled();
  });

  it("어드민도 데모 라우트 없이 /app/inquiry 로 이동한다", async () => {
    getDemoAccessStateMock.mockResolvedValue("admin");
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "지금 시작하기" }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/app/inquiry"),
    );
  });

  it("비로그인이면 로그인 후 /app/inquiry 로 돌아오도록 보낸다", async () => {
    getDemoAccessStateMock.mockResolvedValue("guest");
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "지금 시작하기" }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        `/login?redirect=${encodeURIComponent("/app/inquiry")}`,
      ),
    );
    expect(alertMock).not.toHaveBeenCalled();
  });
});

describe("InDepthResearch 랜딩 구성", () => {
  beforeEach(() => {
    getDemoAccessStateMock.mockReset();
  });

  it("h1 과 섹션 h2 7개가 시안 순서대로 렌더된다", () => {
    renderPage();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "주제 추천부터 탐구 설계까지, 심화탐구를 끝까지",
      }),
    ).toBeInTheDocument();
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      "심화탐구, 이렇게 완성돼요",
      "이런 학생에게 심화 탐구 서비스를 추천해요",
      "다섯 단계로 차근차근",
      "직접 보고 확인하세요",
      "심화탐구로 달라지는 것들",
      "심화탐구 서비스를 받아본 학생들의 후기",
      "자주 묻는 질문",
    ]);
  });

  it("히어로 목업에 주제 추천 화면 캡처가 들어간다", () => {
    renderPage();
    expect(screen.getByAltText("심화탐구 주제 추천 화면")).toBeInTheDocument();
  });

  it("화면 미리보기 섹션에 탭 점 3개와 설계 리포트 화면이 보인다", () => {
    renderPage();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByAltText("설계 리포트 화면")).toBeInTheDocument();
  });

  it("FAQ 질문을 누르면 답변이 펼쳐진다", () => {
    renderPage();
    const question = screen.getByRole("button", {
      name: "탐구 설계는 얼마나 자세하게 도와주나요?",
    });
    expect(question).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(question);
    expect(question).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText(
        "주제・가설・연구 방법・일정까지 설계서를 함께 구성하며, 실제 탐구 수행과 작성은 학생 본인이 진행합니다.",
      ),
    ).toBeVisible();
  });

  it("설계서 작성 카드 설명에 화살표를 쓰지 않는다", () => {
    renderPage();
    expect(
      screen.getByText("가설, 검증, 해석, 한계의 설계서를 함께 구성합니다."),
    ).toBeInTheDocument();
  });
});
