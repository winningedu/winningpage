import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import ReportsTable from "./ReportsTable";
import type { ReportRow } from "./reportsLogic";

const base: ReportRow = {
  sessionId: "s1",
  date: "2026.10.01",
  subject: "수학",
  topic: "미분 응용",
  linkKind: "후속형",
  score: "82.0",
  statusKey: "confirmed",
  statusLabel: "확정",
  actionLabel: "열기",
  to: "/app/inquiry/reports/s1",
  note: null,
};

function renderTable(rows: ReportRow[]) {
  return render(
    <MemoryRouter>
      <ReportsTable rows={rows} />
    </MemoryRouter>,
  );
}

describe("ReportsTable 과목 칸", () => {
  it("교과가 아닌 행은 영역 라벨과 활동명을 그대로 보여 준다", () => {
    renderTable([{ ...base, subject: "자율 / 학급 회의" }]);
    const row = screen.getByRole("row", { name: /미분 응용/ });
    expect(within(row).getByText("자율 / 학급 회의")).toBeInTheDocument();
  });
});

describe("ReportsTable", () => {
  it("caption 과 영역 열 없는 6개 열 머리글을 그린다", () => {
    renderTable([base]);
    expect(screen.getByRole("table", { name: /보관함/ })).toBeInTheDocument();
    const heads = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads).toEqual([
      "일자",
      "과목",
      "주제",
      "연계 방식",
      "점수",
      "상태",
      "동작",
    ]);
  });

  it("확정 행은 열기 링크를 가진다", () => {
    renderTable([base]);
    const row = screen.getByRole("row", { name: /미분 응용/ });
    expect(within(row).getByText("82.0")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "열기" })).toHaveAttribute(
      "href",
      "/app/inquiry/reports/s1",
    );
  });

  it("열린 행은 이어서 하기 링크를 가진다", () => {
    renderTable([
      {
        ...base,
        statusKey: "open",
        statusLabel: "작성 중",
        actionLabel: "이어서 하기",
        to: "/app/inquiry/write",
      },
    ]);
    const table = screen.getByRole("table");
    expect(
      within(table).getByRole("link", { name: "이어서 하기" }),
    ).toHaveAttribute("href", "/app/inquiry/write");
  });

  it("보관 행은 링크 없이 안내문을 그린다", () => {
    renderTable([
      {
        ...base,
        statusKey: "archived",
        statusLabel: "만료",
        actionLabel: null,
        to: null,
        note: "기간이 지나 만료돼 이어서 할 수 없어요",
      },
    ]);
    const table = screen.getByRole("table");
    expect(within(table).queryByRole("link")).toBeNull();
    expect(within(table).getByText(/이어서 할 수 없어요/)).toBeInTheDocument();
  });

  it("행이 없으면 조건 안내를 그린다", () => {
    renderTable([]);
    expect(
      screen.getByText("조건에 맞는 심화탐구가 없어요"),
    ).toBeInTheDocument();
  });
});

describe("ReportsTable 모바일 카드", () => {
  it("md 미만은 카드 목록에 주제와 일자, 과목을 그린다", () => {
    renderTable([base]);
    const list = screen.getByRole("list", { name: /보관함/ });
    expect(list.parentElement).toHaveClass("md:hidden");
    const card = within(list).getByRole("listitem");
    expect(within(card).getByText("미분 응용")).toHaveClass("font-semibold");
    expect(within(card).getByText("2026.10.01, 수학")).toBeInTheDocument();
    expect(within(card).getByText("확정")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "열기" })).toHaveAttribute(
      "href",
      "/app/inquiry/reports/s1",
    );
  });

  it("보관 행 카드는 링크 없이 안내문을 그린다", () => {
    renderTable([
      {
        ...base,
        statusKey: "archived",
        statusLabel: "만료",
        actionLabel: null,
        to: null,
        note: "기간이 지나 만료돼 이어서 할 수 없어요",
      },
    ]);
    const card = within(screen.getByRole("list")).getByRole("listitem");
    expect(within(card).queryByRole("link")).toBeNull();
    expect(within(card).getByText(/이어서 할 수 없어요/)).toBeInTheDocument();
  });

  it("표는 hidden md:block 래퍼 안에 있다", () => {
    renderTable([base]);
    const wrapper = screen.getByRole("table").closest(".md\\:block");
    expect(wrapper).toHaveClass("hidden");
  });
});
