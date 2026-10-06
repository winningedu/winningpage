import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import ResultCard from "./ResultCard";

afterEach(cleanup);

function renderCard(replySent: boolean | null) {
  return render(
    <MemoryRouter>
      <ResultCard replySent={replySent} />
    </MemoryRouter>,
  );
}

describe("ResultCard", () => {
  test("적립 완료 문구와 두 이동 버튼", () => {
    renderCard(null);
    expect(
      screen.getByText(
        "활동 기록에 적립됐어요. 다음 심화탐구를 시작할 때 출발 활동으로 고를 수 있어요",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "보관함으로" })).toHaveAttribute(
      "href",
      "/app/inquiry/reports",
    );
    expect(
      screen.getByRole("link", { name: "새 심화탐구 시작" }),
    ).toHaveAttribute("href", "/app/inquiry");
  });

  test("회신이 null 이면 회신 줄이 없다", () => {
    renderCard(null);
    expect(screen.queryByText(/성장설계/)).not.toBeInTheDocument();
  });

  test("회신 성공", () => {
    renderCard(true);
    expect(
      screen.getByText("성장설계 실행계획 과제를 완료로 알렸어요"),
    ).toBeVisible();
  });

  test("회신 실패는 다음 접속 때 다시 보낸다고 안내", () => {
    renderCard(false);
    expect(
      screen.getByText("성장설계 회신은 다음 접속 때 다시 보내요"),
    ).toBeVisible();
  });
});
