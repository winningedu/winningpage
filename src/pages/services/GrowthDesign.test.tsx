import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock, getDemoAccessStateMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  getDemoAccessStateMock: vi.fn(),
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => navigateMock,
}));

vi.mock("@/lib/demoAccess", () => ({
  getDemoAccessState: getDemoAccessStateMock,
}));

import GrowthDesign from "./GrowthDesign";

function renderPage() {
  render(
    <MemoryRouter>
      <GrowthDesign />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  getDemoAccessStateMock.mockReset();
});

describe("GrowthDesign 히어로 CTA", () => {
  it("로그인 상태면 /app/growth 로 이동한다", async () => {
    getDemoAccessStateMock.mockResolvedValue("user");
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "지금 시작하기" }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/app/growth"),
    );
  });

  it("어드민도 /app/growth 로 이동한다", async () => {
    getDemoAccessStateMock.mockResolvedValue("admin");
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "지금 시작하기" }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/app/growth"),
    );
  });

  it("비로그인이면 로그인 후 /app/growth 로 돌아오도록 보낸다", async () => {
    getDemoAccessStateMock.mockResolvedValue("guest");
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "지금 시작하기" }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        `/login?redirect=${encodeURIComponent("/app/growth")}`,
      ),
    );
  });
});

describe("GrowthDesign 섹션 구성", () => {
  it("섹션 헤딩 7개(프로세스는 2줄 한 헤딩)와 고지문을 렌더한다", () => {
    renderPage();
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent ?? "");
    for (const expected of [
      "4단계 핵심 프로세스",
      "단계별로, 성장 방향을 설계합니다",
      "성장설계를 추천해요",
      "학년에 맞춰 다섯 갈래로",
      "성장설계로 정리되는 것들",
      "근거 없이 판정하지 않습니다",
      "자주 묻는 질문",
    ]) {
      expect(headings.some((text) => text.includes(expected))).toBe(true);
    }
    expect(headings.some((text) => text.includes("위닝 성장설계의"))).toBe(
      true,
    );
    expect(headings).toHaveLength(7);
    expect(
      screen.getByText(/모든 진단은 위닝 내부 기준이며 대학의 평가 결과나/, {
        selector: "p",
      }),
    ).toBeInTheDocument();
  });
});

describe("GrowthDesign 단계 탭", () => {
  it("초기 활성 탭의 카드와 예시 행을 보여주고 예시가 없는 카드에는 라벨이 없다", () => {
    renderPage();
    expect(screen.getByRole("tab", { name: "활동 방향" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    expect(screen.getByText("대주제와 학년별 소주제")).toBeInTheDocument();
    expect(
      screen.getByText("2학년 꽃 ・ 내가 만든 숫자가 믿을 만한지 따지기"),
    ).toBeInTheDocument();

    const noExampleCard = screen.getByText("반복된 문제의식").parentElement;
    expect(noExampleCard).not.toBeNull();
    expect(within(noExampleCard as HTMLElement).queryByText("예시")).toBeNull();
  });

  it("다른 탭을 누르면 카드가 교체된다", () => {
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "실행계획" }));
    expect(screen.getByRole("tab", { name: "실행계획" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("시기별 할 일")).toBeInTheDocument();
    expect(screen.queryByText("대주제와 학년별 소주제")).toBeNull();
  });
});

describe("GrowthDesign FAQ", () => {
  it("질문을 누르면 답변이 펼쳐진다", () => {
    renderPage();
    const button = screen.getByRole("button", {
      name: "어떤 자료를 분석하나요?",
    });
    const answerId = button.getAttribute("aria-controls") as string;
    const answer = document.getElementById(answerId) as HTMLElement;
    expect(answer).toHaveAttribute("hidden");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(answer).not.toHaveAttribute("hidden");
  });
});

describe("GrowthDesign 카드 섹션", () => {
  it("학년 카드, 성과 패널, 원칙 카드를 렌더한다", () => {
    renderPage();
    expect(screen.getByText("중3")).toBeInTheDocument();
    expect(screen.getByText("고등학교 3년을 미리 설계")).toBeInTheDocument();
    expect(screen.getByText("대주제・학년별 로드맵")).toBeInTheDocument();
    expect(screen.getByText("씨앗・꽃・만개")).toBeInTheDocument();
    expect(screen.getByText("원칙 1")).toBeInTheDocument();
    expect(screen.getByText("근거 활동 연결")).toBeInTheDocument();
  });
});
