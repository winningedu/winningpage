import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import SourceFilterCard from "./SourceFilterCard";

afterEach(cleanup);

describe("SourceFilterCard", () => {
  test("자기평가서 확정본은 재료로 쓸 수 없다는 안내 한 줄을 보인다", () => {
    render(
      <SourceFilterCard
        counts={{ performance: 1, deep: 1, manual: 0, total: 2 }}
        filter={{}}
        onFilter={vi.fn()}
        academicYears={[]}
        grades={[]}
        subjects={[]}
        selectedCount={0}
      />,
    );
    expect(
      screen.getAllByText("자기평가서 확정본은 결과물이라 재료로 쓸 수 없어요"),
    ).toHaveLength(1);
  });
});
