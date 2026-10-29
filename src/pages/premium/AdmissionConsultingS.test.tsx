import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import AdmissionConsultingS from "./AdmissionConsultingS";

describe("AdmissionConsultingS", () => {
  it("단계 라벨에서 미술 접두어 없이 활동보고서 구성을 안내한다", () => {
    render(
      <MemoryRouter>
        <AdmissionConsultingS />
      </MemoryRouter>,
    );
    expect(screen.getAllByText("활동보고서 구성 지도").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText(/미술활동보고서 구성/)).not.toBeInTheDocument();
  });
});
