import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import AddNaesinGradeModal from "./AddNaesinGradeModal";

// 2026-11-22T15:30Z = 서울 11/23, 로스앤젤레스 11/22. UTC 날짜(11/22)를 그대로 쓰면
// 서울 학생의 기본 날짜가 하루 어긋난다.
describe("AddNaesinGradeModal 기본 날짜", () => {
  afterEach(() => vi.useRealTimers());

  test.each([
    ["Asia/Seoul", "2026-11-23"],
    ["America/Los_Angeles", "2026-11-22"],
  ])("%s 학생의 입력일 기본값은 %s다", (timeZone, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-22T15:30:00Z"));
    render(
      <AddNaesinGradeModal
        open
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        timeZone={timeZone}
      />,
    );
    expect(screen.getByDisplayValue(expected)).toBeInTheDocument();
  });
});
