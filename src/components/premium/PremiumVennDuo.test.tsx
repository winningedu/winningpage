import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PremiumVennDuo from "./PremiumVennDuo";

const LEFT = { eyebrow: "DESIGN", title: "설계", items: ["가", "나", "다"] };
const RIGHT = { eyebrow: "COACHING", title: "실행", items: ["라", "마", "바"] };

describe("PremiumVennDuo", () => {
  it("양쪽을 h3와 목록 마크업으로 렌더하고 이미지 역할을 쓰지 않는다", () => {
    render(
      <PremiumVennDuo left={LEFT} right={RIGHT} center="FROM JEJU TO SKY" />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual([
      expect.stringContaining("설계"),
      expect.stringContaining("실행"),
    ]);
    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(2);
    expect(
      within(lists[0] as HTMLElement).getAllByRole("listitem"),
    ).toHaveLength(3);
    expect(within(lists[1] as HTMLElement).getByText("바")).toBeInTheDocument();
  });

  it("중앙 문구를 렌더한다", () => {
    render(
      <PremiumVennDuo left={LEFT} right={RIGHT} center="FROM JEJU TO SKY" />,
    );
    expect(screen.getByText("FROM JEJU TO SKY")).toBeInTheDocument();
  });
});
