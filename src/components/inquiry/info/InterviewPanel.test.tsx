import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import InterviewPanel from "./InterviewPanel";

function setup() {
  const onSave = vi.fn();
  render(
    <InterviewPanel disabled={false} assetKey="interview:1" onSave={onSave} />,
  );
  return onSave;
}

function open() {
  fireEvent.click(screen.getByRole("button", { name: /기억으로 되살리기/ }));
}

describe("InterviewPanel", () => {
  test("처음에는 접혀 있고 누르면 7문항이 펼쳐진다", () => {
    setup();
    const toggle = screen.getByRole("button", { name: /기억으로 되살리기/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText(/어떤 활동이었나요/)).toBeNull();
    open();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText(/어떤 활동이었나요/)).toBeVisible();
    expect(screen.getByLabelText(/남이 만든 기준/)).toBeVisible();
    expect(screen.getByLabelText(/시간이 더 있었으면/)).toBeVisible();
    expect(screen.getByLabelText(/선생님 피드백/)).toBeVisible();
  });

  test("빈틈을 하나도 고르지 않으면 빈틈 저장이 비활성이다", () => {
    setup();
    open();
    expect(screen.getByRole("button", { name: "빈틈 저장" })).toBeDisabled();
  });

  test("답에 따라 빈틈 후보와 근거 문항이 나타난다", () => {
    setup();
    open();
    fireEvent.click(screen.getByRole("button", { name: "인터넷 검색" }));
    expect(
      screen.getByRole("checkbox", { name: /원 출처를 확인하지 않고 인용함/ }),
    ).toBeVisible();
    expect(screen.getByText("3번 답변(인터넷 검색)에서 추정")).toBeVisible();
  });

  test("1번 답과 빈틈 1개를 고르면 저장하고 자산을 넘긴다", () => {
    const onSave = setup();
    open();
    fireEvent.change(screen.getByLabelText(/어떤 활동이었나요/), {
      target: { value: "여름철 산책 판단 기준 탐구" },
    });
    fireEvent.click(screen.getByRole("button", { name: "인터넷 검색" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: /원 출처를 확인하지 않고 인용함/ }),
    );
    const save = screen.getByRole("button", { name: "빈틈 저장" });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      key: "interview:1",
      reliability: "B",
      input: {
        kind: "interview",
        answers: { q1: "여름철 산책 판단 기준 탐구", q3: ["internet"] },
        gaps: ["원 출처를 확인하지 않고 인용함"],
      },
    });
  });

  test("1번 답이 비어 있으면 저장하지 않고 안내한다", () => {
    const onSave = setup();
    open();
    fireEvent.change(screen.getByLabelText(/후보에 없으면 직접 적기/), {
      target: { value: "직접 쓴 빈틈" },
    });
    fireEvent.click(screen.getByRole("button", { name: "빈틈 저장" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "활동의 주제를 한 줄 적어 주세요.",
    );
  });

  test("저장하면 패널이 접히고 다시 열면 입력이 비어 있다", () => {
    setup();
    open();
    const q1 = screen.getByLabelText(/어떤 활동이었나요/);
    fireEvent.change(q1, { target: { value: "활동" } });
    fireEvent.change(screen.getByLabelText(/후보에 없으면 직접 적기/), {
      target: { value: "빈틈" },
    });
    fireEvent.click(screen.getByRole("button", { name: "빈틈 저장" }));
    expect(screen.queryByLabelText(/어떤 활동이었나요/)).toBeNull();
    open();
    expect(screen.getByLabelText(/어떤 활동이었나요/)).toHaveValue("");
  });
});
