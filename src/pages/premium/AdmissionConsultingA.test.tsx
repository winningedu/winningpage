import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import AdmissionConsultingA from "./AdmissionConsultingA";

describe("AdmissionConsultingA", () => {
  it("05번 박스는 실전 코칭이고 학습 코칭은 04번 하나만 남는다", () => {
    render(
      <MemoryRouter>
        <AdmissionConsultingA />
      </MemoryRouter>,
    );
    expect(screen.getAllByText("실전 코칭").length).toBeGreaterThan(0);
    expect(screen.getAllByText("학습 코칭")).toHaveLength(1);
  });
});
