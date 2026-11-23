import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ScheduleInput from "./ScheduleInput";

afterEach(cleanup);

function renderRows(rows: { kind: string; date: string; subject: string }[]) {
  return render(
    <ScheduleInput
      value={rows}
      maxEvents={3}
      diagnosedAt="2026-11-09"
      onChange={() => undefined}
    />,
  );
}

describe("ScheduleInput 행 오류", () => {
  it("종류나 날짜 한쪽만 고른 행은 그 행 아래에 둘 다 고르라고 알린다", () => {
    renderRows([
      { kind: "PERF", date: "2026-11-27", subject: "" },
      { kind: "EXAM", date: "", subject: "" },
    ]);
    // 13 E24: 일정 종류와 날짜를 골라 주세요.
    const messages = screen.getAllByText("일정 종류와 날짜를 골라 주세요.");
    expect(messages).toHaveLength(1);
    expect(screen.getByLabelText("날짜 2")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("날짜 1")).not.toHaveAttribute("aria-invalid");
  });
});
