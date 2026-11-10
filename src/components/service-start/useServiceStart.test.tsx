import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useServiceStart } from "./useServiceStart";

const mocks = vi.hoisted(() => ({
  startNotice: true,
  auth: null as { user: object | null; isReady: boolean } | null,
}));

vi.mock("@/config/site", () => ({
  site: {
    get features() {
      return { serviceStartNotice: mocks.startNotice };
    },
  },
}));

vi.mock("@/context/AuthProvider", () => ({
  useAuthOptional: () => mocks.auth,
}));

function Harness({
  proceed,
  resultNotice,
}: {
  proceed: () => void;
  resultNotice: boolean;
}) {
  const { requestStart, startDialogs } = useServiceStart({
    to: "/app/performance",
    resultNotice,
  });
  const location = useLocation();
  return (
    <>
      <button type="button" onClick={() => requestStart(proceed)}>
        시작
      </button>
      <output data-testid="loc">{location.pathname + location.search}</output>
      {startDialogs}
    </>
  );
}

function renderHarness(resultNotice: boolean) {
  const proceed = vi.fn();
  render(
    <MemoryRouter initialEntries={["/landing"]}>
      <Routes>
        <Route
          path="*"
          element={<Harness proceed={proceed} resultNotice={resultNotice} />}
        />
      </Routes>
    </MemoryRouter>,
  );
  return proceed;
}

beforeEach(() => {
  mocks.startNotice = true;
  mocks.auth = { user: null, isReady: true };
});

describe("useServiceStart - 스쿨멘토 비로그인", () => {
  it("시작을 누르면 이용권 없음 안내를 보이고 진행하지 않는다", async () => {
    const proceed = renderHarness(true);
    fireEvent.click(screen.getByRole("button", { name: "시작" }));

    expect(
      screen.getByRole("dialog", { name: "이용권이 없습니다" }),
    ).toBeInTheDocument();
    expect(screen.getByText("결제 후 이용해 주세요.")).toBeInTheDocument();
    expect(
      screen.getByText("소속 기관에서 이용 중이면 로그인해 주세요."),
    ).toBeInTheDocument();
    expect(proceed).not.toHaveBeenCalled();
  });

  it("로그인 버튼은 복귀 경로를 달아 로그인 화면으로 보낸다", async () => {
    renderHarness(true);
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    expect(screen.getByTestId("loc")).toHaveTextContent(
      "/login?redirect=%2Fapp%2Fperformance",
    );
  });

  it("닫기는 안내만 닫고 이동하지 않는다", async () => {
    const proceed = renderHarness(true);
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("loc")).toHaveTextContent("/landing");
    expect(proceed).not.toHaveBeenCalled();
  });
});

describe("useServiceStart - 스쿨멘토 로그인", () => {
  beforeEach(() => {
    mocks.auth = { user: {}, isReady: true };
  });

  it("결과물 안내가 켜져 있으면 확인했어요 뒤에 진행한다", async () => {
    const proceed = renderHarness(true);
    fireEvent.click(screen.getByRole("button", { name: "시작" }));

    expect(
      screen.getByRole("dialog", { name: "이렇게 쓰면 안 돼요" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "서비스가 만든 추천 주제, 설계 리포트, 평가 리포트 문장을 그대로 복사해서 제출하면 안 돼요.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "결과물은 참고 자료예요. 내 경험과 생각으로 직접 고쳐 써 주세요.",
      ),
    ).toBeInTheDocument();
    expect(proceed).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "확인했어요" }));
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it("Esc로 닫으면 진행하지 않고, 다시 누르면 또 보인다", async () => {
    const proceed = renderHarness(true);
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(proceed).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    expect(
      screen.getByRole("dialog", { name: "이렇게 쓰면 안 돼요" }),
    ).toBeInTheDocument();
  });

  it("결과물 안내가 꺼져 있으면 바로 진행한다", async () => {
    const proceed = renderHarness(false);
    fireEvent.click(screen.getByRole("button", { name: "시작" }));

    expect(proceed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("useServiceStart - 바로 진행하는 경우", () => {
  it("위닝(플래그 꺼짐)은 비로그인이어도 바로 진행한다", async () => {
    mocks.startNotice = false;
    const proceed = renderHarness(true);
    fireEvent.click(screen.getByRole("button", { name: "시작" }));

    expect(proceed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("인증 제공자가 없거나 준비 전이면 바로 진행한다", async () => {
    mocks.auth = null;
    const first = renderHarness(true);
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("인증이 준비되지 않았으면 바로 진행한다", async () => {
    mocks.auth = { user: null, isReady: false };
    const proceed = renderHarness(true);
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    expect(proceed).toHaveBeenCalledTimes(1);
  });
});
