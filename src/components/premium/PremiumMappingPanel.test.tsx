import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PremiumMappingPanel from "./PremiumMappingPanel";

const ROWS = [
  { from: "수업 프로젝트, 에세이", to: "교과 세부능력 및 특기사항" },
  { from: "클럽, 학생회", to: "동아리, 자율활동" },
];

describe("PremiumMappingPanel", () => {
  it("제목, 열 머리글, 행 데이터, 하단 문구를 표로 렌더한다", () => {
    render(
      <PremiumMappingPanel
        title="국내대학 제출용"
        fromLabel="국제학교 활동"
        toLabel="생활기록부 항목"
        rows={ROWS}
        footer="모든 기록을 하나의 전공 스토리로 연결합니다."
      />,
    );

    expect(screen.getByText("국내대학 제출용")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(
      within(table).getByRole("columnheader", { name: "국제학교 활동" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "생활기록부 항목" }),
    ).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(ROWS.length + 1);
    expect(within(table).getByText("클럽, 학생회")).toBeInTheDocument();
    expect(
      screen.getByText("모든 기록을 하나의 전공 스토리로 연결합니다."),
    ).toBeInTheDocument();
  });

  it("행마다 좌에서 우로 가는 화살표 아이콘을 aria-hidden 으로 렌더한다", () => {
    const { container } = render(
      <PremiumMappingPanel
        title="t"
        fromLabel="a"
        toLabel="b"
        rows={ROWS}
        footer="f"
      />,
    );
    const bodyRows = within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1);
    for (const row of bodyRows) {
      const icons = row.querySelectorAll("svg");
      expect(icons).toHaveLength(1);
      expect(icons[0]).toHaveAttribute("aria-hidden", "true");
    }
    expect(container.querySelectorAll("tbody svg")).toHaveLength(ROWS.length);
  });

  it("행이 없으면 아무것도 렌더하지 않는다", () => {
    const { container } = render(
      <PremiumMappingPanel
        title="t"
        fromLabel="a"
        toLabel="b"
        rows={[]}
        footer="f"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
