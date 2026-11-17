import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ChildrenTab from "./ChildrenTab";

const { siteMock } = vi.hoisted(() => ({
  siteMock: { features: { studentEnrollment: false } },
}));

vi.mock("@/config/site", () => ({ site: siteMock }));
vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) },
}));

describe("ChildrenTab 코드 명칭", () => {
  it("학생 등록 사이트는 학생 고유코드로 자녀를 찾는다", async () => {
    siteMock.features.studentEnrollment = true;
    const { container } = render(<ChildrenTab />);

    expect(
      await screen.findByText("학생 고유코드로 자녀 찾기"),
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain("연결코드");
  });

  it("그 외 사이트는 연결코드로 자녀를 찾는다", async () => {
    siteMock.features.studentEnrollment = false;
    render(<ChildrenTab />);

    expect(await screen.findByText("연결코드로 자녀 찾기")).toBeInTheDocument();
  });
});
