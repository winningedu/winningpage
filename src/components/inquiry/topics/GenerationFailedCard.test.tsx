import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import GenerationFailedCard from "./GenerationFailedCard";

describe("GenerationFailedCard", () => {
  test("추천 단계 실패는 차감되지 않았다고 안내하고 두 버튼을 낸다", () => {
    const onRetry = vi.fn();
    const onChangeStart = vi.fn();
    render(
      <GenerationFailedCard
        variant="failed"
        mode="recommend"
        attempts={2}
        charged={false}
        onRetry={onRetry}
        onChangeStart={onChangeStart}
        onRestart={vi.fn()}
      />,
    );
    expect(screen.getByText("주제를 만들지 못했어요")).toBeTruthy();
    expect(
      screen.getByText(
        "두 번 시도했지만 조건에 맞는 주제를 만들지 못했어요. 이용 횟수는 차감되지 않았어요.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    fireEvent.click(screen.getByRole("button", { name: "출발 활동 바꾸기" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onChangeStart).toHaveBeenCalledTimes(1);
  });

  test("이미 차감된 세션이면 종결 시 복구된다고 안내한다", () => {
    render(
      <GenerationFailedCard
        variant="failed"
        mode="recommend"
        attempts={2}
        charged
        onRetry={vi.fn()}
        onChangeStart={vi.fn()}
        onRestart={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/차감된 이용 횟수는 종결 시 복구돼요/),
    ).toBeTruthy();
  });

  test("시도 횟수를 모르면 시도 횟수 문구 없이 일반 문장을 쓴다", () => {
    render(
      <GenerationFailedCard
        variant="failed"
        mode="recommend"
        attempts={null}
        charged={false}
        onRetry={vi.fn()}
        onChangeStart={vi.fn()}
        onRestart={vi.fn()}
      />,
    );
    expect(screen.queryByText(/두 번 시도/)).toBeNull();
    expect(screen.getByText(/조건에 맞는 주제를 만들지 못했어요/)).toBeTruthy();
  });

  test("종결 변형은 복구 안내와 처음부터 다시 시작 버튼만 낸다", () => {
    const onRestart = vi.fn();
    render(
      <GenerationFailedCard
        variant="terminal"
        mode="recommend"
        attempts={null}
        charged
        onRetry={vi.fn()}
        onChangeStart={vi.fn()}
        onRestart={onRestart}
      />,
    );
    expect(
      screen.getByText("이 세션은 종결됐어요. 차감된 이용 횟수는 복구됐어요."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "처음부터 다시 시작" }));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  test("설계 단계 실패는 설계 문구로 안내한다", () => {
    render(
      <GenerationFailedCard
        variant="failed"
        mode="plan"
        attempts={2}
        charged
        onRetry={vi.fn()}
        onChangeStart={vi.fn()}
        onRestart={vi.fn()}
      />,
    );
    expect(screen.getByText("설계 리포트를 만들지 못했어요")).toBeTruthy();
    expect(
      screen.getByText(
        "두 번 시도했지만 조건에 맞는 설계를 만들지 못했어요. 차감된 이용 횟수는 종결 시 복구돼요.",
      ),
    ).toBeTruthy();
  });
});
