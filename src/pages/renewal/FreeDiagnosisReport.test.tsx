// Report route: the stored row decides the view. A v3 row (schema_version
// 2026-11-v3) renders ReportV3View with every page; any other row keeps the
// legacy DiagnosisReportView. The route reads diagnosis_reports by attemptId only.
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { laterPages } from "@/components/renewal/report/v3/laterPagesFixture";
import { FRONT_PAGES } from "@/components/renewal/report/v3/testPages";
import { SCHEMA_VERSION } from "@/lib/diagnosis-v3/types";
import { buildReport } from "@/lib/diagnosisReport";
import { makeInput } from "@/lib/diagnosisScoringTestFixtures";
import FreeDiagnosisReport from "./FreeDiagnosisReport";

const { fetchDiagnosisReport } = vi.hoisted(() => ({
  fetchDiagnosisReport: vi.fn(),
}));
vi.mock("@/lib/diagnosisReportQueries", () => ({ fetchDiagnosisReport }));
vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({ userId: null }),
}));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const v3Row = (pages: object) => ({
  attempt_id: "a1",
  schema_version: SCHEMA_VERSION,
  diagnosed_at: "2026-11-10T03:00:00.000Z",
  snapshot: {},
  payload: { version: SCHEMA_VERSION, scores: {}, pages },
});

function renderRoute(path: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route path="/report/:attemptId" element={<FreeDiagnosisReport />} />
        <Route path="/report" element={<FreeDiagnosisReport />} />
        <Route
          path="/app/learning-diagnosis/survey"
          element={<p>survey entry</p>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("FreeDiagnosisReport", () => {
  it("renders the v3 report with all 16 numbered pages for a v3 row", async () => {
    fetchDiagnosisReport.mockResolvedValue(
      v3Row({ ...FRONT_PAGES, ...laterPages }),
    );
    const { container } = renderRoute("/report/a1");

    await waitFor(() =>
      expect(container.querySelectorAll(".fd-report-sheet")).toHaveLength(17),
    );
    for (let n = 1; n <= 16; n += 1) {
      expect(screen.getAllByText(`${n} / 16`).length).toBeGreaterThan(0);
    }
    expect(fetchDiagnosisReport).toHaveBeenCalledWith("a1");
  });

  it("renders 15 numbered pages without page 7 for an M3 row", async () => {
    const { p7: _omitted, ...withoutP7 } = laterPages;
    fetchDiagnosisReport.mockResolvedValue(
      v3Row({ ...FRONT_PAGES, ...withoutP7 }),
    );
    const { container } = renderRoute("/report/a1");

    await waitFor(() =>
      expect(container.querySelectorAll(".fd-report-sheet")).toHaveLength(16),
    );
    expect(screen.queryByText("7 / 16")).toBeNull();
  });

  it("keeps the legacy view for a row of an older schema version", async () => {
    const input = makeInput();
    fetchDiagnosisReport.mockResolvedValue({
      attempt_id: "a0",
      schema_version: "2026-10-v2",
      diagnosed_at: "2026-10-08T03:00:00.000Z",
      snapshot: input,
      payload: buildReport(input),
    });
    renderRoute("/report/a0");

    await screen.findByLabelText(/리포트 표지/);
    expect(screen.queryByText("1 / 16")).toBeNull();
  });

  it("shows the not-found state when the row is missing or hidden by RLS", async () => {
    fetchDiagnosisReport.mockResolvedValue(null);
    renderRoute("/report/none");

    expect(
      await screen.findByText(
        "리포트를 찾을 수 없거나 볼 수 있는 권한이 없습니다.",
      ),
    ).toBeInTheDocument();
  });

  it("sends an entry without an attemptId to the survey and reads no row", async () => {
    fetchDiagnosisReport.mockClear();
    renderRoute("/report");

    expect(await screen.findByText("survey entry")).toBeInTheDocument();
    expect(fetchDiagnosisReport).not.toHaveBeenCalled();
  });

  // Regression of 904f474c: after a submit the report holds the user on the page when
  // Back is pressed; a stored link opened from elsewhere keeps normal Back.
  describe("back navigation", () => {
    const flush = () =>
      waitFor(() => expect(fetchDiagnosisReport).toHaveBeenCalled());

    it("after a submit, absorbs one Back and re-pushes the URL on popstate", async () => {
      const push = vi.spyOn(window.history, "pushState");
      fetchDiagnosisReport.mockResolvedValue(
        v3Row({ ...FRONT_PAGES, ...laterPages }),
      );
      renderRoute("/report/a1", { fromSubmit: true });
      await flush();
      await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
      window.dispatchEvent(new PopStateEvent("popstate"));
      expect(push).toHaveBeenCalledTimes(2);
      push.mockRestore();
    });

    it("leaves history alone for a stored link opened without a submit", async () => {
      const push = vi.spyOn(window.history, "pushState");
      fetchDiagnosisReport.mockResolvedValue(
        v3Row({ ...FRONT_PAGES, ...laterPages }),
      );
      renderRoute("/report/a1");
      await flush();
      window.dispatchEvent(new PopStateEvent("popstate"));
      expect(push).not.toHaveBeenCalled();
      push.mockRestore();
    });
  });
});
