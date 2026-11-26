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

const mockListDiagnosisReports = vi.fn();
vi.mock("@/lib/diagnosisReportQueries", () => ({
  listDiagnosisReports: (...args: unknown[]) =>
    mockListDiagnosisReports(...args),
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
    mockListDiagnosisReports.mockReset();
  });

  it("diagnosis_reports 행이 있고 grant가 없으면 무료 1회 카드를 합성한다", async () => {
    mockListDiagnosisReports.mockResolvedValue([
      {
        attempt_id: "attempt-free-1",
        diagnosed_at: "2026-09-01T00:00:00Z",
      },
    ]);

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
    mockListDiagnosisReports.mockResolvedValue([]);

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
    mockListDiagnosisReports.mockResolvedValue([
      {
        attempt_id: "attempt-paid-1",
        diagnosed_at: "2026-09-01T00:00:00Z",
      },
    ]);

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
    mockListDiagnosisReports.mockReset();
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
    mockListDiagnosisReports.mockResolvedValue([]);

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
    mockListDiagnosisReports.mockResolvedValue([]);

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

describe("MyServicesTab 심화탐구 항목", () => {
  afterEach(() => {
    state.grants = [];
    state.ledger = [];
    mockListDiagnosisReports.mockReset();
  });

  it("inquiry grant 는 위닝 심화탐구로 보여 주고 /app/inquiry 로 연결한다", async () => {
    state.grants = [
      {
        id: "grant-inquiry",
        program_key: "inquiry",
        granted_sessions: null,
        granted_months: 6,
        starts_at: "2026-01-01T00:00:00Z",
        expires_at: "2099-01-01T00:00:00Z",
        first_accessed_at: "2026-01-02T00:00:00Z",
      },
    ];
    mockListDiagnosisReports.mockResolvedValue([]);

    renderTab();

    await waitFor(() =>
      expect(screen.getByText("위닝 심화탐구")).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: /프로그램 가기/ })).toHaveAttribute(
      "href",
      "/app/inquiry",
    );
  });
});

describe("MyServicesTab - 스쿨멘토 서비스 이름", () => {
  afterEach(() => {
    state.grants = [];
    mockListDiagnosisReports.mockReset();
    vi.doUnmock("@/config/site");
    vi.resetModules();
  });

  it("학습진단 카드 이름에 '위닝 '을 붙이지 않는다", async () => {
    vi.resetModules();
    vi.doMock("@/config/site", () => ({
      site: { brandName: "스쿨멘토", features: { stripWinningPrefix: true } },
    }));
    state.grants = [DIAGNOSE_GRANT];
    mockListDiagnosisReports.mockResolvedValue([]);
    const { default: Tab } = await import("./MyServicesTab");

    render(
      <MemoryRouter>
        <Tab />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText("학습진단")).toBeInTheDocument(),
    );
    expect(screen.queryByText("위닝 학습진단")).not.toBeInTheDocument();
  });
});

describe("MyServicesTab - 이용 중인 학습진단 카드", () => {
  const MULTI_SESSION_GRANT = {
    id: "grant-multi",
    program_key: "diagnose",
    granted_sessions: 15,
    granted_months: null,
    starts_at: "2026-01-01T00:00:00Z",
    expires_at: "2099-01-01T00:00:00Z",
    first_accessed_at: "2026-01-02T00:00:00Z",
  };

  afterEach(() => {
    state.grants = [];
    state.ledger = [];
    mockListDiagnosisReports.mockReset();
  });

  it("리포트가 있으면 결과 리포트 보기와 검사하기를 함께 보여 준다", async () => {
    state.grants = [MULTI_SESSION_GRANT];
    state.ledger = [
      { grant_id: "grant-multi", delta: -1 },
      { grant_id: "grant-multi", delta: -1 },
    ];
    mockListDiagnosisReports.mockResolvedValue([
      {
        attempt_id: "attempt-multi-3",
        diagnosed_at: "2026-09-01T00:00:00Z",
      },
    ]);

    renderTab();

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "결과 리포트 보기" }),
      ).toHaveAttribute("href", "/learning-diagnosis/report/attempt-multi-3"),
    );
    expect(screen.getByRole("link", { name: /검사하기/ })).toHaveAttribute(
      "href",
      "/app/learning-diagnosis/survey/1",
    );
  });

  it("리포트가 없으면 검사하기만 보여 준다", async () => {
    state.grants = [MULTI_SESSION_GRANT];
    mockListDiagnosisReports.mockResolvedValue([]);

    renderTab();

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: /검사하기/ }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("결과 리포트 보기")).not.toBeInTheDocument();
  });
});

describe("MyServicesTab - 학습진단 리포트가 여러 건일 때 (QA 2026-11-26 6-1)", () => {
  const TWO_REPORTS = [
    { attempt_id: "attempt-2", diagnosed_at: "2026-10-01T00:00:00Z" },
    { attempt_id: "attempt-1", diagnosed_at: "2026-09-01T00:00:00Z" },
  ];

  afterEach(() => {
    state.grants = [];
    state.ledger = [];
    mockListDiagnosisReports.mockReset();
  });

  it("완료 카드: 2건 이상이면 리포트 목록으로 연결한다", async () => {
    state.grants = [DIAGNOSE_GRANT];
    state.ledger = [{ grant_id: "grant-1", delta: -1 }];
    mockListDiagnosisReports.mockResolvedValue(TWO_REPORTS);

    renderTab();

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "결과 리포트 보기" }),
      ).toHaveAttribute("href", "/mypage/report/diagnosis"),
    );
  });

  it("이용 중 카드: 2건 이상이면 리포트 목록으로 연결한다", async () => {
    state.grants = [
      {
        ...DIAGNOSE_GRANT,
        granted_sessions: 5,
        expires_at: "2099-01-01T00:00:00Z",
      },
    ];
    mockListDiagnosisReports.mockResolvedValue(TWO_REPORTS);

    renderTab();

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "결과 리포트 보기" }),
      ).toHaveAttribute("href", "/mypage/report/diagnosis"),
    );
  });

  it("무료 카드: 2건 이상이면 리포트 목록으로 연결한다", async () => {
    mockListDiagnosisReports.mockResolvedValue(TWO_REPORTS);

    renderTab();

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "결과 리포트 보기" }),
      ).toHaveAttribute("href", "/mypage/report/diagnosis"),
    );
  });

  it("완료 카드: 1건이면 그 리포트로 바로 연결한다", async () => {
    state.grants = [DIAGNOSE_GRANT];
    state.ledger = [{ grant_id: "grant-1", delta: -1 }];
    mockListDiagnosisReports.mockResolvedValue([TWO_REPORTS[0]]);

    renderTab();

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "결과 리포트 보기" }),
      ).toHaveAttribute("href", "/learning-diagnosis/report/attempt-2"),
    );
  });
});
