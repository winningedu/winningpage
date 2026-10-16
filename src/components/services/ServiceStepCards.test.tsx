import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ServiceStepCards from "./ServiceStepCards";

const ITEMS = [
  { title: "첫째", desc: "첫째 설명" },
  { title: "둘째", desc: "둘째 설명" },
];

function cardOf(title: string) {
  const card = screen.getByText(title).parentElement;
  if (!card) throw new Error("카드 요소를 찾지 못했다");
  return card;
}

describe("ServiceStepCards 테두리", () => {
  it("bordered 면 카드에 테두리 클래스가 붙는다", () => {
    render(<ServiceStepCards items={ITEMS} bordered />);
    for (const { title } of ITEMS) {
      expect(cardOf(title).className).toContain("border border-line");
    }
  });

  it("기본값이면 카드에 테두리 클래스가 없다", () => {
    render(<ServiceStepCards items={ITEMS} />);
    for (const { title } of ITEMS) {
      expect(cardOf(title).className).not.toContain("border");
    }
  });
});
