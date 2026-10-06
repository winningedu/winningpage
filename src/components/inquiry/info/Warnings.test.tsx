import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import Warnings from "./Warnings";

describe("Warnings", () => {
  test("경고 문장을 목록으로 그린다", () => {
    render(<Warnings messages={["첫째 경고", "둘째 경고"]} />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(
      ["첫째 경고", "둘째 경고"],
    );
  });

  test("경고가 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(<Warnings messages={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
