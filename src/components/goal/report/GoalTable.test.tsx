import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import GoalTable from "./GoalTable";

// 행 수정/삭제가 카드 헤더 "수정" 토글 뒤로 숨겨진 계약(성적관리 행324, 시안 2910:3638,
// 9/4 디자이너 재요청)을 고정한다. GoalTable.tsx 상단 주석의 이력 참고.
const rows = [
  { term: "1회차", korean: 1, math: 2, english: 1, science: 2, average: 1.5 },
  { term: "2회차", korean: 1, math: 1, english: 2, science: 2, average: 1.5 },
];

describe("GoalTable 편집 토글", () => {
  test("기본 상태에는 헤더 '수정' 버튼만 있고 행별 수정/삭제는 없다", () => {
    render(
      <GoalTable
        title="내신"
        rows={rows}
        onEditRow={vi.fn()}
        onDeleteRow={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "수정" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "삭제" }),
    ).not.toBeInTheDocument();
  });

  test("'수정'을 누르면 행별 수정/삭제가 드러나고 버튼이 '완료'로 바뀐다", () => {
    render(
      <GoalTable
        title="내신"
        rows={rows}
        onEditRow={vi.fn()}
        onDeleteRow={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "수정" }));

    expect(screen.getByRole("button", { name: "완료" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByRole("button", { name: "수정" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "삭제" })).toHaveLength(2);
  });

  test("편집 모드에서 '완료'를 누르면 행별 수정/삭제가 다시 사라진다", () => {
    render(
      <GoalTable
        title="내신"
        rows={rows}
        onEditRow={vi.fn()}
        onDeleteRow={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    fireEvent.click(screen.getByRole("button", { name: "완료" }));

    expect(screen.getByRole("button", { name: "수정" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.queryByRole("button", { name: "삭제" }),
    ).not.toBeInTheDocument();
  });

  test("onEditRow/onDeleteRow가 둘 다 없으면 헤더 '수정' 토글도 렌더되지 않는다", () => {
    render(<GoalTable title="내신" rows={rows} onAddRound={vi.fn()} />);

    expect(
      screen.queryByRole("button", { name: "수정" }),
    ).not.toBeInTheDocument();
  });

  test("회차가 없으면(빈 상태) 편집할 게 없어 헤더 '수정' 토글도 숨긴다", () => {
    render(
      <GoalTable
        title="내신"
        rows={[]}
        onAddRound={vi.fn()}
        onEditRow={vi.fn()}
        onDeleteRow={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "수정" }),
    ).not.toBeInTheDocument();
  });

  test("설문 행은 첫 줄에 읽기 전용으로 보이고 다음 회차의 증감 배지에 끼지 않는다", () => {
    render(
      <GoalTable
        title="내신"
        rows={rows}
        baselineRow={{ term: "설문 입력", average: 3 }}
        onEditRow={vi.fn()}
        onDeleteRow={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "수정" }));

    const trs = screen.getAllByRole("row");
    // 머리글 1 + 설문 1 + 회차 2
    expect(trs).toHaveLength(4);
    expect(trs[1]).toHaveTextContent("설문 입력");
    expect(trs[1]).toHaveTextContent("3");
    expect(trs[1]?.querySelectorAll("button")).toHaveLength(0);
    // 첫 회차 행에는 설문 행 때문에 증감 배지(3 대비 1.50)가 생기지 않는다
    expect(trs[2]?.textContent).not.toMatch(/1\.50/);
    expect(screen.getAllByRole("button", { name: "삭제" })).toHaveLength(2);
  });

  test("회차가 없어도 설문 행이 있으면 표를 보이고 수정 토글은 숨긴다", () => {
    render(
      <GoalTable
        title="내신"
        rows={[]}
        baselineRow={{ term: "설문 입력", average: 3 }}
        onAddRound={vi.fn()}
        onEditRow={vi.fn()}
        onDeleteRow={vi.fn()}
      />,
    );

    expect(screen.getByText("설문 입력")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "수정" }),
    ).not.toBeInTheDocument();
  });
});
