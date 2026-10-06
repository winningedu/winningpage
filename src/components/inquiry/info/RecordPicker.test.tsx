import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { RecordCandidate } from "@/lib/inquiry/types";
import RecordPicker from "./RecordPicker";

function record(overrides: Partial<RecordCandidate> = {}): RecordCandidate {
  return {
    id: "r1",
    sourceProgram: "performance",
    status: "confirmed",
    gradeLabel: "고2",
    semester: 1,
    subjectGroup: "교과",
    subject: "생명과학",
    topic: "항상성 기전 정리",
    concept: "항상성, 음성 되먹임",
    limitation: "교과서 수준에 머무름",
    confirmedAt: "2026-05-10T00:00:00Z",
    createdAt: "2026-05-10T00:00:00Z",
    ...overrides,
  };
}

const RECORDS = [
  record(),
  record({
    id: "r2",
    subject: "진로활동",
    topic: "산책 판단 기준 탐구",
    concept: null,
    limitation: null,
  }),
];
const COUNTS = [
  { subject: "생명과학", count: 1 },
  { subject: "진로활동", count: 1 },
];

function setup(records = RECORDS, selected: string[] = []) {
  const onToggle = vi.fn();
  render(
    <RecordPicker
      records={records}
      subjectCounts={records.length === 0 ? [] : COUNTS}
      selectedIds={new Set(selected)}
      disabled={false}
      onToggle={onToggle}
    />,
  );
  return onToggle;
}

describe("RecordPicker", () => {
  test("기록이 없으면 비활성 안내만 그린다", () => {
    setup([]);
    expect(
      screen.getByText("기록이 없어요. 위에서 주제를 직접 적어 주세요"),
    ).toBeVisible();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  test("과목 버튼에 전체와 과목별 건수를 보여 준다", () => {
    setup();
    expect(screen.getByRole("button", { name: "전체" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "생명과학 1" })).toBeVisible();
    expect(screen.getByRole("button", { name: "진로활동 1" })).toBeVisible();
  });

  test("각 행에 과목, 수행 시기, 주제, 개념, 한계를 보여 준다", () => {
    setup();
    const row = screen
      .getByRole("checkbox", { name: /항상성 기전 정리/ })
      .closest("li") as HTMLElement;
    expect(row).toHaveTextContent("생명과학");
    expect(row).toHaveTextContent("2026-05");
    expect(row).toHaveTextContent("개념과 도구: 항상성, 음성 되먹임");
    expect(row).toHaveTextContent(
      "확인하지 않고 넘어간 것: 교과서 수준에 머무름",
    );
  });

  test("값이 없는 개념, 한계 줄은 그리지 않는다", () => {
    setup();
    const row = screen
      .getByRole("checkbox", { name: /산책 판단 기준 탐구/ })
      .closest("li") as HTMLElement;
    expect(row).not.toHaveTextContent("개념과 도구");
    expect(row).not.toHaveTextContent("확인하지 않고 넘어간 것");
  });

  test("과목 버튼을 누르면 그 과목만 남는다", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "진로활동 1" }));
    expect(
      screen.queryByRole("checkbox", { name: /항상성 기전 정리/ }),
    ).toBeNull();
    expect(
      screen.getByRole("checkbox", { name: /산책 판단 기준 탐구/ }),
    ).toBeVisible();
  });

  test("체크하면 기록을 넘기고 선택된 행은 체크 상태다", () => {
    const onToggle = setup(RECORDS, ["r1"]);
    expect(
      screen.getByRole("checkbox", { name: /항상성 기전 정리/ }),
    ).toBeChecked();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /산책 판단 기준 탐구/ }),
    );
    expect(onToggle).toHaveBeenCalledWith(RECORDS[1]);
  });
});
