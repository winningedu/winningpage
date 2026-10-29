import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import ColumnCard from "./ColumnCard";

const VARIANTS = ["grid", "heroLarge", "heroSmall"] as const;

function renderCard(
  variant: (typeof VARIANTS)[number],
  linkUrl?: string | null,
) {
  render(
    <MemoryRouter>
      <ColumnCard
        variant={variant}
        column={{ id: "7", title: "칼럼 제목", link_url: linkUrl }}
      />
    </MemoryRouter>,
  );
  return screen.getByRole("link");
}

describe.each(VARIANTS)("ColumnCard %s", (variant) => {
  it("link_url이 있으면 새 창 외부 링크로 이동한다", () => {
    const link = renderCard(variant, "https://youtu.be/abc");
    expect(link).toHaveAttribute("href", "https://youtu.be/abc");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("link_url이 없으면 내부 상세로 이동한다", () => {
    const link = renderCard(variant, null);
    expect(link).toHaveAttribute("href", "/info/column/7");
    expect(link).not.toHaveAttribute("target");
  });

  it("외부링크 표시는 link_url이 있을 때만 나온다", () => {
    const { container } = render(
      <MemoryRouter>
        <ColumnCard
          variant={variant}
          column={{ id: "7", title: "t", link_url: "https://a.com" }}
        />
      </MemoryRouter>,
    );
    expect(container.querySelector("svg.lucide-external-link")).not.toBeNull();
  });

  it("link_url이 없으면 외부링크 표시가 없다", () => {
    const { container } = render(
      <MemoryRouter>
        <ColumnCard variant={variant} column={{ id: "7", title: "t" }} />
      </MemoryRouter>,
    );
    expect(container.querySelector("svg.lucide-external-link")).toBeNull();
  });
});
