import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ActivityFields } from "@/lib/inquiry/types";
import FinalFieldsTable from "./FinalFieldsTable";

const fields: ActivityFields = {
  topic: "효소 활성",
  concept: "미카엘리스",
  method: "온도별 측정",
  result: "최적 온도 확인",
  limitation: "",
  numbers: ["37도", "2배"],
  sources: [],
};

describe("FinalFieldsTable", () => {
  it("caption 과 7개 항목을 그린다", () => {
    render(<FinalFieldsTable fields={fields} />);
    expect(
      screen.getByRole("table", { name: "확정 적립 내용" }),
    ).toBeInTheDocument();
    const names = screen.getAllByRole("rowheader").map((h) => h.textContent);
    expect(names).toEqual([
      "주제",
      "개념",
      "방법",
      "결과",
      "한계",
      "수치",
      "출처",
    ]);
  });

  it("값이 없으면 대시, 배열은 항목별로 그린다", () => {
    render(<FinalFieldsTable fields={fields} />);
    const limitRow = screen.getByRole("row", { name: /한계/ });
    expect(within(limitRow).getByText("-")).toBeInTheDocument();
    expect(screen.getByText("37도")).toBeInTheDocument();
    expect(screen.getByText("2배")).toBeInTheDocument();
    const srcRow = screen.getByRole("row", { name: /출처/ });
    expect(within(srcRow).getByText("-")).toBeInTheDocument();
  });
});
