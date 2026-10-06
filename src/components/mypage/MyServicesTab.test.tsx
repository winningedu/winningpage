import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import MyServicesTab from "./MyServicesTab";

// 무료 진단(회원가입 1회, grant 미적재) 전용 합성 카드 — 파일 상단 주석
// "무료 진단 전용 합성 카드(2026-09-02)" 참고. diagnosis_reports 행 유무 ×
// grant 유무 조합으로 카드 노출/중복 방지를 검증한다.

const state = vi.hoisted(() => ({
  grants: [] as Record<string, unknown>[],
  ledger: [] as Record<string, unknown>[],
}));

vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({ userId: "user-1" }),
}));

vi.mock("@/lib/diagnosisAccess", () => ({
  checkDiagnosisAccess: vi.fn(async () => ({
    allowed: true,
    freeAvailable: null,
    quotaRemaining: null,
    quotaTotal: null,
    planEndsAt: null,
  })),
}));

const mockFetchLatestDiagnosisReport = vi.fn();
vi.mock("@/lib/diagnosisReportQueries", () => ({
  fetchLatestDiagnosisReport: (...args: unknown[]) =>
    mockFetchLatestDiagnosisReport(...args),
}));

// 컴포넌트의 실제 호출 체인(.select().eq()[.is()].overrideTypes())에서
// overrideTypes()가 항상 마지막 호출이라, 그 자리에서만 진짜 Promise를
// 돌려주면 await가 동작한다 — 중간 메서드는 체이닝용 일반 객체를 반환한다
// (biome noThenProperty: 객체 리터럴에 then 키를 직접 정의하지 않는다).
type QueryBuilder = {
  select: () => QueryBuilder;
  eq: () => QueryBuilder;
  is: () => QueryBuilder;
  overrideTypes: () => Promise<{ data: unknown; error: null }>;
};

function makeQuery(data: unknown): QueryBuilder {
  const api: QueryBuilder = {
    select: () => api,
    eq: () => api,
    is: () => api,
    overrideTypes: () => Promise.resolve({ data, error: null }),
  };
  return api;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) =>
      makeQuery(
        table === "program_access_grants" ? state.grants : state.ledger,
      ),
  },
}));

function renderTab() {
  return render(
    <MemoryRouter>
      <MyServicesTab />
    </MemoryRouter>,
  );
}

const DIAGNOSE_GRANT = {
  id: "grant-1",
  program_key: "diagnose",
  granted_sessions: 1,
  granted_months: null,
  starts_at: "2026-01-01T00:00:00Z",
  expires_at: "2026-02-01T00:00:00Z",
  first_accessed_at: "2026-01-02T00:00:00Z",
};

describe("MyServicesTab — 무료 진단 합성 카드", () => {
  afterEach(() => {
    state.grants = [];
    state.ledger = [];
    mockFetchLatestDiagnosisReport.mockReset();
  });

  it("diagnosis_reports 행이 있고 grant가 없으면 무료 1회 카드를 합성한다", async () => {
    mockFetchLatestDiagnosisReport.mockResolvedValue({
      attempt_id: "attempt-free-1",
      diagnosed_at: "2026-09-01T00:00:00Z",
    });

    renderTab();

    await waitFor(() =>
      expect(screen.getByText("위닝 학습진단")).toBeInTheDocument(),
    );
    expect(screen.getByText("무료 1회")).toBeInTheDocument();
    const reportLink = screen.getByRole("link", {
      name: "결과 리포트 보기",
    });
    expect(reportLink).toHaveAttribute(
      "href",
      "/learning-diagnosis/report/attempt-free-1",
    );
  });

  it("diagnosis_reports 행이 없으면 카드를 렌더하지 않는다(빈 상태)", async () => {
    mockFetchLatestDiagnosisReport.mockResolvedValue(null);

    renderTab();

    await waitFor(() =>
      expect(
        screen.getByText("아직 결제한 서비스가 없어요"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("위닝 학습진단")).not.toBeInTheDocument();
  });

  it("grant 기반 diagnose 카드가 이미 있으면 중복 합성하지 않는다", async () => {
    state.grants = [DIAGNOSE_GRANT];
    mockFetchLatestDiagnosisReport.mockResolvedValue({
      attempt_id: "attempt-paid-1",
      diagnosed_at: "2026-09-01T00:00:00Z",
    });

    renderTab();

    await waitFor(() =>
      expect(screen.getByText("위닝 학습진단")).toBeInTheDocument(),
    );
    expect(screen.getAllByText("위닝 학습진단")).toHaveLength(1);
    expect(screen.queryByText("무료 1회")).not.toBeInTheDocument();
  });
});

describe("MyServicesTab 성장설계 항목", () => {
  afterEach(() => {
    state.grants = [];
    state.ledger = [];
    mockFetchLatestDiagnosisReport.mockReset();
  });

  it("growth grant 는 서비스명을 그대로 보여 주고 /app/growth 로 연결한다", async () => {
    state.grants = [
      {
        id: "grant-growth",
        program_key: "growth",
        granted_sessions: null,
        granted_months: 6,
        starts_at: "2026-01-01T00:00:00Z",
        expires_at: "2099-01-01T00:00:00Z",
        first_accessed_at: "2026-01-02T00:00:00Z",
      },
    ];
    mockFetchLatestDiagnosisReport.mockResolvedValue(null);

    renderTab();

    await waitFor(() =>
      expect(screen.getByText("위닝 성장설계")).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: /프로그램 가기/ })).toHaveAttribute(
      "href",
      "/app/growth",
    );
  });

  it("selfeval grant 는 위닝 자기평가서 이름으로 /app/selfeval 에 연결한다", async () => {
    state.grants = [
      {
        id: "grant-selfeval",
        program_key: "selfeval",
        granted_sessions: 3,
        granted_months: null,
        starts_at: "2026-01-01T00:00:00Z",
        expires_at: "2099-01-01T00:00:00Z",
        first_accessed_at: "2026-01-02T00:00:00Z",
      },
    ];
    mockFetchLatestDiagnosisReport.mockResolvedValue(null);

    renderTab();

    await waitFor(() =>
      expect(screen.getByText("위닝 자기평가서")).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: /프로그램 가기/ })).toHaveAttribute(
      "href",
      "/app/selfeval",
    );
  });
});
