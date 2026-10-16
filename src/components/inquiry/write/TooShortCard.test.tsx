import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import TooShortCard from "./TooShortCard";

describe("TooShortCard", () => {
  test("평가를 실행하지 않았고 차감이 없음을 알린다", () => {
    render(<TooShortCard total={260} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ⅰ~Ⅶ절 합계 300자 미만이라 평가를 실행하지 않았어요. 이용 횟수는 차감되지 않았어요.",
    );
    expect(screen.getByText("지금 합계 260자")).toBeVisible();
  });

  test("합계를 모르면 합계 줄을 숨긴다", () => {
    render(<TooShortCard total={null} />);
    expect(screen.queryByText(/지금 합계/)).toBeNull();
  });
});
