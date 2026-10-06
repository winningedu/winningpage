import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import SummaryTable from "./SummaryTable";

afterEach(cleanup);

test("항목과 내용을 표로 그리고 배지를 점수 행에 붙인다", () => {
  render(
    <SummaryTable
      rows={[
        { key: "topic", label: "주제", value: "내 주제" },
        {
          key: "score",
          label: "평가 점수",
          value: "내부 기준 91.3점",
          badge: "소규모 보완 후 제출 가능",
        },
      ]}
    />,
  );
  const table = screen.getByRole("table", { name: "적립될 내용" });
  expect(within(table).getByRole("rowheader", { name: "주제" })).toBeVisible();
  expect(within(table).getByText("내 주제")).toBeVisible();
  expect(within(table).getByText("소규모 보완 후 제출 가능")).toBeVisible();
});

test("error 행은 빨간 글씨 클래스를 쓴다", () => {
  render(
    <SummaryTable
      rows={[
        { key: "l", label: "한계", value: "추출하지 못했어요", error: true },
      ]}
    />,
  );
  expect(screen.getByText("추출하지 못했어요")).toHaveClass("text-error");
});
