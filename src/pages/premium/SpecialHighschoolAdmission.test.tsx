import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import SpecialHighschoolAdmission from "./SpecialHighschoolAdmission";

describe("SpecialHighschoolAdmission", () => {
  it("05번 박스는 실전 코칭이고 학습 코칭은 04번만 남는다(위아래 2회 렌더)", () => {
    render(
      <MemoryRouter>
        <SpecialHighschoolAdmission />
      </MemoryRouter>,
    );
    expect(screen.getAllByText("실전 코칭")).toHaveLength(2);
    expect(screen.getAllByText("학습 코칭")).toHaveLength(2);
  });
});
