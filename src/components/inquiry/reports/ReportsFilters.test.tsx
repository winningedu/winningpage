import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ReportsFilters from "./ReportsFilters";

describe("ReportsFilters", () => {
  it("과목과 상태 select 를 label 로 찾을 수 있다", () => {
    render(
      <ReportsFilters
        subjects={["전체", "수학"]}
        subject="전체"
        status="all"
        onSubjectChange={() => {}}
        onStatusChange={() => {}}
      />,
    );
    expect(screen.getByLabelText("과목")).toHaveValue("전체");
    expect(screen.getByLabelText("상태")).toHaveValue("all");
    expect(screen.getByRole("option", { name: "작성 중" })).toBeInTheDocument();
  });

  it("바꾸면 콜백에 값이 전달된다", () => {
    const onSubject = vi.fn();
    const onStatus = vi.fn();
    render(
      <ReportsFilters
        subjects={["전체", "수학"]}
        subject="전체"
        status="all"
        onSubjectChange={onSubject}
        onStatusChange={onStatus}
      />,
    );
    fireEvent.change(screen.getByLabelText("과목"), {
      target: { value: "수학" },
    });
    fireEvent.change(screen.getByLabelText("상태"), {
      target: { value: "confirmed" },
    });
    expect(onSubject).toHaveBeenCalledWith("수학");
    expect(onStatus).toHaveBeenCalledWith("confirmed");
  });
});
