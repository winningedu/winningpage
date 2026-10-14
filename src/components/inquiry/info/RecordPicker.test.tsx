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

  test.each([
    ["performance", "위닝 수행평가"],
    ["deep", "위닝 심화탐구"],
    ["self", "위닝 자기평가서"],
    ["manual", "직접 입력"],
    ["upload", "업로드"],
  ])("출처 %s 는 %s 라벨로 표시한다", (sourceProgram, label) => {
    setup([record({ id: "x1", sourceProgram })]);
    expect(screen.getByText(label)).toBeVisible();
  });

  test.each(["legacy", "toString", ""])(
    "알 수 없는 출처 '%s' 는 출처 태그를 그리지 않는다",
    (sourceProgram) => {
      setup([record({ id: "x1", sourceProgram })]);
      expect(screen.getByText("생명과학")).toBeVisible();
      expect(screen.getByText("2026-05")).toBeVisible();
      expect(screen.queryByText(/위닝|직접 입력|업로드|function/)).toBeNull();
    },
  );

  describe("학년별 묶음", () => {
    const GRADED = [
      record({ id: "g1", gradeLabel: "고1", topic: "일학년 주제" }),
      record({ id: "g3", gradeLabel: "고3", topic: "삼학년 주제" }),
      record({ id: "gn", gradeLabel: null, topic: "학년없음 주제" }),
      record({ id: "g2", gradeLabel: "고2", topic: "이학년 주제" }),
    ];

    test("소제목을 고3, 고2, 고1, 학년 미지정 순으로 그린다", () => {
      setup(GRADED);
      const headings = screen
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent);
      expect(headings).toEqual(["고3", "고2", "고1", "학년 미지정"]);
    });

    test("각 기록은 자기 학년 소제목 아래에 있다", () => {
      setup(GRADED);
      const group = screen
        .getByRole("heading", { name: "고2" })
        .closest("section") as HTMLElement;
      expect(group).toHaveTextContent("이학년 주제");
      expect(group).not.toHaveTextContent("삼학년 주제");
    });

    test("기록이 없는 학년은 소제목도 그리지 않는다", () => {
      setup([record({ id: "only", gradeLabel: "고2" })]);
      expect(
        screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
      ).toEqual(["고2"]);
      expect(screen.queryByText("학년 미지정")).toBeNull();
    });

    test("과목 칩으로 거른 뒤 남은 기록만 학년별로 묶는다", () => {
      setup([
        record({ id: "a", gradeLabel: "고3", subject: "생명과학" }),
        record({ id: "b", gradeLabel: "고2", subject: "진로활동" }),
      ]);
      fireEvent.click(screen.getByRole("button", { name: "진로활동 1" }));
      expect(
        screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
      ).toEqual(["고2"]);
    });
  });
});
