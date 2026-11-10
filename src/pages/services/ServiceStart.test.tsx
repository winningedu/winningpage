import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  schoolmentor: true,
  auth: null as { user: object | null; isReady: boolean } | null,
  access: "guest" as "guest" | "user",
}));

vi.mock("@/config/site", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/site")>();
  return {
    ...actual,
    site: {
      ...actual.site,
      get features() {
        return {
          ...actual.site.features,
          serviceStartNotice: mocks.schoolmentor,
          stripWinningPrefix: mocks.schoolmentor,
        };
      },
    },
  };
});

vi.mock("@/context/AuthProvider", () => ({
  useAuthOptional: () => mocks.auth,
}));

vi.mock("@/lib/demoAccess", () => ({
  getDemoAccessState: () => Promise.resolve(mocks.access),
}));

type Landing = {
  name: string;
  load: () => Promise<{ default: ComponentType }>;
  to: string;
  resultNotice: boolean;
  // 위닝 비로그인이 지금 가는 곳
  winningGuestTo: string;
  startLabel: string;
};

const LANDINGS: Landing[] = [
  {
    name: "수행평가",
    load: () => import("./PerformanceAssessment"),
    to: "/app/performance",
    resultNotice: true,
    winningGuestTo: "/app/performance",
    startLabel: "지금 시작하기",
  },
  {
    name: "심화탐구",
    load: () => import("./InDepthResearch"),
    to: "/app/inquiry",
    resultNotice: true,
    winningGuestTo: "/login?redirect=%2Fapp%2Finquiry",
    startLabel: "지금 시작하기",
  },
  {
    name: "자기평가",
    load: () => import("./SelfAssessment"),
    to: "/app/selfeval",
    resultNotice: true,
    winningGuestTo: "/app/selfeval",
    startLabel: "지금 시작하기",
  },
  {
    name: "목표관리",
    load: () => import("./GoalManagement"),
    to: "/app/goal",
    resultNotice: false,
    winningGuestTo: "/app/goal",
    startLabel: "지금 시작하기",
  },
  {
    name: "성장설계",
    load: () => import("./GrowthDesign"),
    to: "/app/growth",
    resultNotice: false,
    winningGuestTo: "/login?redirect=%2Fapp%2Fgrowth",
    startLabel: "지금 시작하기",
  },
  {
    name: "학습진단",
    load: () => import("../renewal/LearningDiagnosisLanding"),
    to: "/app/learning-diagnosis/survey",
    resultNotice: false,
    winningGuestTo: "/app/learning-diagnosis/survey",
    startLabel: "지금 시작하기",
  },
];

function Probe() {
  const location = useLocation();
  return (
    <output data-testid="loc">{location.pathname + location.search}</output>
  );
}

async function renderLanding(landing: Landing) {
  const { default: Page } = await landing.load();
  render(
    <MemoryRouter initialEntries={["/landing"]}>
      <Probe />
      <Routes>
        <Route path="/landing" element={<Page />} />
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>,
  );
}

function pressStart(landing: Landing) {
  const control = screen.getAllByText(landing.startLabel)[0] as HTMLElement;
  fireEvent.click(control);
}

const loc = () => screen.getByTestId("loc").textContent;

beforeEach(() => {
  mocks.schoolmentor = true;
  mocks.auth = { user: null, isReady: true };
  mocks.access = "guest";
});

describe.each(LANDINGS)("스쿨멘토 $name 소개 화면", (landing) => {
  it("비로그인이 시작을 누르면 이용권 없음 안내만 보이고 이동하지 않는다", async () => {
    await renderLanding(landing);
    pressStart(landing);

    expect(
      await screen.findByRole("dialog", { name: "이용권이 없습니다" }),
    ).toBeInTheDocument();
    expect(screen.getByText("결제 후 이용해 주세요.")).toBeInTheDocument();
    expect(loc()).toBe("/landing");
  });

  it("안내의 로그인은 복귀 경로를 달아 로그인으로 보내고 닫기는 머문다", async () => {
    await renderLanding(landing);
    pressStart(landing);
    fireEvent.click(await screen.findByRole("button", { name: "닫기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(loc()).toBe("/landing");

    pressStart(landing);
    fireEvent.click(await screen.findByRole("button", { name: "로그인" }));
    await waitFor(() =>
      expect(loc()).toBe(`/login?redirect=${encodeURIComponent(landing.to)}`),
    );
  });

  it("로그인한 학생은 결과물 안내가 필요한 서비스만 안내 창을 거친다", async () => {
    mocks.auth = { user: {}, isReady: true };
    mocks.access = "user";
    await renderLanding(landing);
    pressStart(landing);

    if (landing.resultNotice) {
      expect(
        await screen.findByRole("dialog", { name: "이렇게 쓰면 안 돼요" }),
      ).toBeInTheDocument();
      expect(loc()).toBe("/landing");
      fireEvent.click(screen.getByRole("button", { name: "확인했어요" }));
    } else {
      expect(screen.queryByRole("dialog")).toBeNull();
    }
    await waitFor(() => expect(loc()).toBe(landing.to));
  });
});

describe.each(LANDINGS)("위닝 $name 소개 화면", (landing) => {
  beforeEach(() => {
    mocks.schoolmentor = false;
  });

  it("비로그인이어도 안내 창 없이 지금처럼 이동한다", async () => {
    await renderLanding(landing);
    pressStart(landing);

    await waitFor(() => expect(loc()).toBe(landing.winningGuestTo));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("로그인해도 결과물 안내 창 없이 바로 이동한다", async () => {
    mocks.auth = { user: {}, isReady: true };
    mocks.access = "user";
    await renderLanding(landing);
    pressStart(landing);

    await waitFor(() => expect(loc()).toBe(landing.to));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("학습진단 소개 화면 하단 시작하기", () => {
  const diagnosis = LANDINGS[5] as Landing;

  it("스쿨멘토 비로그인은 하단 버튼도 안내 창을 연다", async () => {
    await renderLanding(diagnosis);
    fireEvent.click(screen.getByRole("link", { name: /학습진단 시작하기/ }));

    expect(
      await screen.findByRole("dialog", { name: "이용권이 없습니다" }),
    ).toBeInTheDocument();
    expect(loc()).toBe("/landing");
  });
});

describe("학습진단 소개 화면 무료 카드", () => {
  const diagnosis = LANDINGS[5] as Landing;

  it("스쿨멘토에서는 유료 서비스 전에 무료로 카드가 없다", async () => {
    await renderLanding(diagnosis);
    expect(screen.queryByText(/유료 서비스 전에 무료로/)).toBeNull();
  });

  it("위닝에서는 그대로 보인다", async () => {
    mocks.schoolmentor = false;
    await renderLanding(diagnosis);
    expect(screen.getByText(/유료 서비스 전에 무료로/)).toBeInTheDocument();
  });
});

describe("스쿨멘토 서비스 이름", () => {
  it.each(LANDINGS.slice(0, 5))(
    "$name 소개 화면에 위닝 접두어가 남지 않는다",
    async (landing) => {
      await renderLanding(landing);
      expect(document.body.textContent).not.toMatch(
        /위닝 (수행평가|자기평가|성장설계|심화탐구|목표관리|내부 기준)/,
      );
    },
  );
});
