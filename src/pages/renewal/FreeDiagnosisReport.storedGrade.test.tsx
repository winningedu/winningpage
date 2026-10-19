// 저장된 리포트(DB 경로)의 표지 학년 칸 - gradeRaw 도입 전 payload 는 snapshot 에서 되찾는다.
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { buildReportFromInput } from "@/lib/diagnosisReportBuild";
import { makeInput } from "@/lib/diagnosisScoringTestFixtures";
import FreeDiagnosisReport from "./FreeDiagnosisReport";

const input = makeInput({
  profile: { name: null, gradeLevel: "H1", schoolType: null },
});
const oldPayload = buildReportFromInput(input) as any;
delete oldPayload.student.gradeRaw;

vi.mock("@/lib/diagnosisReportQueries", () => ({
  fetchDiagnosisReport: vi.fn(async () => ({
    payload: oldPayload,
    snapshot: input,
  })),
}));
vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({ userId: null }),
}));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

describe("FreeDiagnosisReport DB 경로", () => {
  it("gradeRaw 없는 저장분도 snapshot 학년을 표지 학년 칸에 보여 준다", async () => {
    render(
      <MemoryRouter initialEntries={["/report/a1"]}>
        <Routes>
          <Route path="/report/:attemptId" element={<FreeDiagnosisReport />} />
        </Routes>
      </MemoryRouter>,
    );

    const cover = await waitFor(() => screen.getByLabelText(/리포트 표지/));
    expect(within(cover).getByTestId("cover-info")).toHaveTextContent(
      "학년고등학교 1학년",
    );
  });
});
