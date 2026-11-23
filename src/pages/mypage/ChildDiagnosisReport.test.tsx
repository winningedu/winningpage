// Parent view: same version branching as the self route, plus the child gate.
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { laterPages } from "@/components/renewal/report/v3/laterPagesFixture";
import { FRONT_PAGES } from "@/components/renewal/report/v3/testPages";
import { SCHEMA_VERSION } from "@/lib/diagnosis-v3/types";
import { buildReport } from "@/lib/diagnosisReport";
import { makeInput } from "@/lib/diagnosisScoringTestFixtures";
import ChildDiagnosisReport from "./ChildDiagnosisReport";

const { fetchDiagnosisReport } = vi.hoisted(() => ({
  fetchDiagnosisReport: vi.fn(),
}));
vi.mock("@/lib/diagnosisReportQueries", () => ({ fetchDiagnosisReport }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: async () => ({
      data: [
        {
          student_profile_id: "s1",
          student_name: "child",
          link_status: "approved",
        },
      ],
      error: null,
    }),
  },
}));

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={["/c/s1/r/a1"]}>
      <Routes>
        <Route
          path="/c/:studentId/r/:attemptId"
          element={<ChildDiagnosisReport />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ChildDiagnosisReport", () => {
  it("renders the v3 report with all 16 numbered pages for a v3 row", async () => {
    fetchDiagnosisReport.mockResolvedValue({
      attempt_id: "a1",
      profile_id: "s1",
      schema_version: SCHEMA_VERSION,
      diagnosed_at: "2026-11-10T03:00:00.000Z",
      snapshot: {},
      payload: {
        version: SCHEMA_VERSION,
        scores: {},
        pages: { ...FRONT_PAGES, ...laterPages },
      },
    });
    const { container } = renderRoute();

    await waitFor(() =>
      expect(container.querySelectorAll(".fd-report-sheet")).toHaveLength(17),
    );
    expect(screen.getAllByText("16 / 16").length).toBeGreaterThan(0);
  });

  it("keeps the legacy view for a row of an older schema version", async () => {
    const input = makeInput();
    fetchDiagnosisReport.mockResolvedValue({
      attempt_id: "a1",
      profile_id: "s1",
      schema_version: "2026-10-v2",
      diagnosed_at: "2026-10-08T03:00:00.000Z",
      snapshot: input,
      payload: buildReport(input),
    });
    renderRoute();

    await screen.findByLabelText(/리포트 표지/);
    expect(screen.queryByText("1 / 16")).toBeNull();
  });
});
