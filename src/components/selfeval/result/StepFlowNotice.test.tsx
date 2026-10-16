import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { type FlowState, initialFlowState } from "./generationFlow";
import StepFlowNotice from "./StepFlowNotice";

const state = (over: Partial<FlowState<unknown>>): FlowState<unknown> => ({
  ...initialFlowState(),
  ...over,
});

function renderNotice(
  kind: "analysis" | "write" | "verify",
  s: FlowState<unknown>,
  onRetry = vi.fn(),
) {
  render(
    <MemoryRouter>
      <StepFlowNotice kind={kind} sessionId="s1" state={s} onRetry={onRetry} />
    </MemoryRouter>,
  );
  return onRetry;
}

describe("StepFlowNotice", () => {
  test("진행 중에는 단계별 로딩 문구를 보여 준다", () => {
    renderNotice("write", state({ phase: "running" }));
    expect(screen.getByText("1차 작성본을 만드는 중")).toBeTruthy();
  });

  test("작성 실패는 서버 메시지와 다시 시도(n/10) 를 보여 주고 누르면 재시도한다", () => {
    const onRetry = renderNotice(
      "write",
      state({
        phase: "failed",
        attempts: 3,
        errorCode: "MODEL_UPSTREAM_FAILED",
        errorMessage: "모델이 응답하지 않았어요.",
      }),
    );
    expect(screen.getByText("작성본을 만들지 못했어요")).toBeTruthy();
    expect(screen.getByText("모델이 응답하지 않았어요.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도(3/10)" }));
    expect(onRetry).toHaveBeenCalled();
  });

  test("검증 실패는 차감이 되돌려졌을 때만 복구 안내를 붙인다", () => {
    renderNotice("verify", state({ phase: "failed", reversed: true }));
    expect(
      screen.getByText(/이용 횟수 1회는 자동으로 복구됐어요/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 검증하기" })).toBeTruthy();
  });

  test("검증 실패에서 되돌림 정보가 없으면 복구 안내를 쓰지 않는다", () => {
    renderNotice("verify", state({ phase: "failed", reversed: null }));
    expect(screen.queryByText(/자동으로 복구/)).toBeNull();
  });

  test("종결은 시작 화면 링크만 주고 재시도 버튼은 없다", () => {
    renderNotice("write", state({ phase: "terminal" }));
    expect(screen.getByText(/차감된 이용 횟수는 복구돼요/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /다시/ })).toBeNull();
    expect(
      screen.getByRole("link", { name: "처음 화면으로" }).getAttribute("href"),
    ).toBe("/app/selfeval");
  });

  test("이용권이 없으면 이용권 안내 링크를 준다", () => {
    renderNotice(
      "write",
      state({ phase: "blocked", errorCode: "NO_ENTITLEMENT" }),
    );
    expect(
      screen
        .getByRole("link", { name: "이용권 보러 가기" })
        .getAttribute("href"),
    ).toBe("/pricing?service=selfeval");
  });

  test("STEP_ORDER 는 서버가 알려 준 단계의 화면으로 보낸다", () => {
    renderNotice(
      "verify",
      state({ phase: "failed", errorCode: "STEP_ORDER", orderStep: 2 }),
    );
    expect(
      screen
        .getByRole("link", { name: "진행 중인 화면으로" })
        .getAttribute("href"),
    ).toBe("/app/selfeval/s/s1/analysis");
  });
});
