import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }));

vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({ userId: "student-1" }),
}));
vi.mock("@/lib/diagnosisReportQueries", () => ({
  listDiagnosisReports: listMock,
}));

import MyDiagnosisReports from "./MyDiagnosisReports";

function renderPage() {
  return render(
    <MemoryRouter>
      <MyDiagnosisReports />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  listMock.mockReset();
});

describe("MyDiagnosisReports (학생 본인 학습진단 리포트 목록)", () => {
  it("본인 id 로 조회한 리포트를 최신순 전부 보여 주고 각 리포트로 연결한다", async () => {
    listMock.mockResolvedValue([
      {
        attempt_id: "a3",
        diagnosed_at: "2026-11-20T03:00:00Z",
        schema_version: "2026-11-v3",
      },
      {
        attempt_id: "a2",
        diagnosed_at: "2026-10-10T03:00:00Z",
        schema_version: "2026-08-fd2",
      },
      {
        attempt_id: "a1",
        diagnosed_at: "2026-09-01T03:00:00Z",
        schema_version: "2026-08-fd2",
      },
    ]);

    renderPage();

    const links = await screen.findAllByRole("link", { name: /회차 학습진단/ });
    expect(listMock).toHaveBeenCalledWith("student-1");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/learning-diagnosis/report/a3",
      "/learning-diagnosis/report/a2",
      "/learning-diagnosis/report/a1",
    ]);
    expect(links[0]).toHaveTextContent("3회차 학습진단");
    expect(links[2]).toHaveTextContent("1회차 학습진단");
  });

  it("리포트가 없으면 빈 상태 문구를 보여 준다", async () => {
    listMock.mockResolvedValue([]);

    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText("아직 완료된 학습진단이 없어요."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("link", { name: /회차 학습진단/ })).toBeNull();
  });
});
