import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import * as XLSX from "xlsx";
import { ApiError } from "@/lib/http/client";
import { exportGoalUniversityCutRowsToXlsx } from "./cutsBulkXlsx";
import { GoalCutsListSummary } from "./GoalCutsPanels";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  reportAdminError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  triggerXlsxDownload: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

// 응답 모양은 실제 zod 스키마로 한 번 더 통과시킨다(픽스처가 서버 계약과 어긋나면 여기서 깨진다).
const reply = (call: (...args: unknown[]) => unknown) => ({
  json: async (schema: { parse: (value: unknown) => unknown }) =>
    schema.parse(await call()),
});

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: {
    get: (...args: unknown[]) => reply(() => mocks.get(...args)),
    post: (...args: unknown[]) => reply(() => mocks.post(...args)),
  },
}));

vi.mock("@/pages/admin/shared/adminErrors", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/pages/admin/shared/adminErrors")
  >()),
  reportAdminError: mocks.reportAdminError,
}));

vi.mock("@/pages/admin/shared/adminToast", () => ({
  toastSuccess: mocks.toastSuccess,
  toastWarning: mocks.toastWarning,
}));

vi.mock("@/pages/admin/shared/xlsxDownload", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/pages/admin/shared/xlsxDownload")
  >()),
  triggerXlsxDownload: mocks.triggerXlsxDownload,
}));

const SUMMARY = {
  total: 4,
  active: 3,
  normal: 2,
  special: 1,
  jungsi: 1,
  missing: 1,
  comboTotal: 3,
  comboNoJungsi: 2,
};

const STATS = {
  universityCount: 3,
  pairCount: 4,
  totalRows: 8,
  normalCount: 4,
  specialCount: 4,
  year2026Pairs: 4,
  year2025Pairs: 0,
  excludedStarPairs: 0,
  excludedEmptyPairs: 0,
  excludedNoTrackPairs: 0,
  mergedCount: 0,
  distribution: { min: 2, p25: 2, median: 3, p75: 4, max: 5 },
  samples: [],
};

const PREVIEW = {
  sourceRowCount: 4,
  stats: STATS,
  analysis: {
    overlapCount: 2,
    manualCount: 1,
    inactiveCount: 0,
    notedCount: 0,
    preservedCount: 1,
    nameAxisCount: 1,
  },
  applyCount: 6,
  orphanCount: 2,
};

function routeGets(over: Record<string, unknown> = {}) {
  const table: Record<string, unknown> = {
    "goal/admin/cuts/summary": SUMMARY,
    "goal/admin/cuts/rows": {
      items: [{ id: 7, cut_type: "normal" }],
      next: null,
    },
    "goal/admin/cuts/jungsi-missing": {
      items: [{ university_name: "나대", department_name: "영문" }],
    },
    "goal/admin/cuts/backfill": PREVIEW,
    ...over,
  };
  mocks.get.mockImplementation(async (url: string) => {
    const value = table[url];
    if (value instanceof Error) throw value;
    return value;
  });
}

function renderPanels(onReload = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <GoalCutsListSummary onReload={onReload} mutationSeq={0} />
    </QueryClientProvider>,
  );
  return onReload;
}

function xlsxFile(rows: Record<string, unknown>[]) {
  const { workbook } = exportGoalUniversityCutRowsToXlsx(rows);
  const buffer = new Uint8Array(
    XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
  ).buffer;
  const file = new File([buffer], "cuts.xlsx");
  // jsdom 의 File 에는 arrayBuffer 가 없을 수 있다.
  Object.defineProperty(file, "arrayBuffer", { value: async () => buffer });
  return file;
}

const NEW_ROW = {
  cut_type: "normal",
  university_name: "나대",
  department_name: "영문",
  avg_cut: 3,
  source: "manual",
  source_year: "",
  is_active: true,
  note: "",
};
const OLD_ROW = { ...NEW_ROW, id: 7, university_name: "가대" };

async function uploadAndOpenPreview(rows: Record<string, unknown>[]) {
  const input = screen.getByLabelText("목표관리 대학 컷 xlsx 파일 선택");
  fireEvent.change(input, { target: { files: [xlsxFile(rows)] } });
  await screen.findByText(/신규 1건/);
}

beforeEach(() => {
  vi.clearAllMocks();
  routeGets();
  mocks.post.mockResolvedValue({ inserted: 1, updated: 1 });
});

describe("현황 요약", () => {
  test("서버 요약의 건수와 정시 컷 없는 조합 수를 보여준다", async () => {
    renderPanels();
    await screen.findByText(/전체 4건/);
    expect(screen.getByText(/노출 3건/)).toBeInTheDocument();
    expect(screen.getByText(/컷 미확보 1건/)).toBeInTheDocument();
    expect(
      screen.getByText(/정시 컷 없는 \(대학, 학과\) 조합: 2건 \/ 전체 3조합/),
    ).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith("goal/admin/cuts/summary", {
      signal: expect.any(AbortSignal),
    });
  });

  test("요약을 못 읽어도 화면은 막지 않고 안내만 보인다", async () => {
    routeGets({
      "goal/admin/cuts/summary": new ApiError({
        status: 500,
        code: "INTERNAL_ERROR",
        detail: "x",
      }),
    });
    renderPanels();
    await screen.findByText(/현황을 불러오지 못했습니다/);
    expect(
      screen.getByRole("button", { name: "미리보기 계산" }),
    ).toBeInTheDocument();
  });
});

describe("엑셀 일괄 관리", () => {
  test("업로드를 검증하고 신규와 수정을 따로 반영한다", async () => {
    const onReload = renderPanels();
    await screen.findByText(/전체 4건/);
    await uploadAndOpenPreview([NEW_ROW, OLD_ROW]);
    expect(mocks.get).toHaveBeenCalledWith("goal/admin/cuts/rows", {
      searchParams: { from: 0 },
    });

    fireEvent.click(screen.getByLabelText(/영향받는 2행을 확인했습니다/));
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());

    const bulkCalls = mocks.post.mock.calls.filter(
      ([url]) => url === "goal/admin/cuts/bulk",
    );
    expect(bulkCalls).toHaveLength(2);
    const [insertBody, updateBody] = bulkCalls.map(
      ([, options]) => options.json.rows as Record<string, unknown>[],
    );
    expect(insertBody?.map((row) => "id" in row)).toEqual([false]);
    expect(updateBody?.map((row) => row.id)).toEqual([7]);
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "엑셀 적용 완료",
      "신규 1건, 수정 1건, 거부 0건.",
    );
    expect(onReload).toHaveBeenCalled();
  });

  test("수정 청크가 실패하면 실패한 행 범위와 되돌려지지 않는다는 안내를 보인다", async () => {
    const onReload = renderPanels();
    await screen.findByText(/전체 4건/);
    await uploadAndOpenPreview([NEW_ROW, OLD_ROW]);
    const failure = new ApiError({
      status: 409,
      code: "DB_UNIQUE_VIOLATION",
      detail: "이미 등록된 값입니다(중복).",
    });
    mocks.post
      .mockResolvedValueOnce({ inserted: 1, updated: 0 })
      .mockRejectedValueOnce(failure);

    fireEvent.click(screen.getByLabelText(/영향받는 2행을 확인했습니다/));
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    await waitFor(() => expect(mocks.reportAdminError).toHaveBeenCalled());

    expect(mocks.reportAdminError).toHaveBeenCalledWith(
      "엑셀 적용 실패(1~1행). 이미 반영된 청크는 되돌려지지 않습니다",
      failure,
    );
    expect(onReload).toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  test("정시 템플릿 다운로드는 정시 컷 없는 조합 목록으로 파일을 만든다", async () => {
    renderPanels();
    await screen.findByText(/전체 4건/);
    fireEvent.click(screen.getByLabelText("정시 컷 없는 조합(정시 템플릿)"));
    fireEvent.click(
      screen.getByRole("button", { name: "엑셀 다운로드 (정시 컷 템플릿)" }),
    );
    await waitFor(() => expect(mocks.triggerXlsxDownload).toHaveBeenCalled());
    expect(mocks.get).toHaveBeenCalledWith("goal/admin/cuts/jungsi-missing");
    expect(mocks.triggerXlsxDownload.mock.calls[0]?.[1]).toMatch(
      /^목표관리_정시컷_템플릿_\d{8}\.xlsx$/,
    );
  });

  test("전체 다운로드는 id 순으로 이어 받은 행으로 파일을 만든다", async () => {
    renderPanels();
    const button = await screen.findByRole("button", {
      name: "엑셀 다운로드 (전체 4행)",
    });
    fireEvent.click(button);
    await waitFor(() => expect(mocks.triggerXlsxDownload).toHaveBeenCalled());
    expect(mocks.triggerXlsxDownload.mock.calls[0]?.[1]).toMatch(
      /^목표관리_대학컷_전체_\d{8}\.xlsx$/,
    );
  });
});

describe("입결 유도 백필", () => {
  async function computePreview() {
    fireEvent.click(screen.getByRole("button", { name: "미리보기 계산" }));
    await screen.findByText(/생성 대상/);
  }

  test("미리보기를 계산해 보여준 뒤 확인한 건수를 실어 반영한다", async () => {
    mocks.post.mockResolvedValue({ applied: 6, deactivated: 0 });
    const onReload = renderPanels();
    await screen.findByText(/전체 4건/);
    await computePreview();
    expect(mocks.get).toHaveBeenCalledWith("goal/admin/cuts/backfill", {
      searchParams: { yearMode: "prefer2026", preserveMode: "preserve" },
      timeout: false,
    });
    expect(screen.getByText(/기존 행과 겹침: 2행/)).toBeInTheDocument();
    expect(
      screen.getByText(/보존 대상 1행을 이번 반영에서 제외합니다/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/영향받는 6행을 확인했습니다/));
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());

    expect(mocks.post).toHaveBeenCalledWith("goal/admin/cuts/backfill", {
      json: {
        yearMode: "prefer2026",
        preserveMode: "preserve",
        orphanMode: "keep",
        expectedApplyCount: 6,
        expectedOrphanCount: 2,
      },
      timeout: false,
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "입결 유도 컷 6행을 반영했습니다.",
      undefined,
    );
    expect(onReload).toHaveBeenCalled();
    // 반영하면 미리보기는 닫힌다.
    expect(screen.queryByText(/생성 대상/)).not.toBeInTheDocument();
  });

  test("고아 노출 끄기를 고르면 그 건수까지 합쳐 확인하고 보낸다", async () => {
    mocks.post.mockResolvedValue({ applied: 6, deactivated: 2 });
    renderPanels();
    await screen.findByText(/전체 4건/);
    fireEvent.click(screen.getByLabelText("노출을 끈다(is_active=false)"));
    await computePreview();
    fireEvent.click(screen.getByLabelText(/영향받는 8행을 확인했습니다/));
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(mocks.post.mock.calls[0]?.[1].json).toMatchObject({
      orphanMode: "deactivate",
      expectedOrphanCount: 2,
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "입결 유도 컷 6행을 반영했습니다.",
      "고아 유도 행 2건의 노출을 껐습니다.",
    );
  });

  test("옵션을 바꾸면 미리보기를 버린다", async () => {
    renderPanels();
    await screen.findByText(/전체 4건/);
    await computePreview();
    fireEvent.click(screen.getByLabelText("2026만"));
    expect(screen.queryByText(/생성 대상/)).not.toBeInTheDocument();
  });

  test("서버가 청크 실패를 알리면 실패 행 범위와 안내를 보이고 미리보기를 닫지 않는다", async () => {
    const onReload = renderPanels();
    await screen.findByText(/전체 4건/);
    await computePreview();
    const failure = new ApiError({
      status: 500,
      code: "BACKFILL_APPLY_FAILED",
      detail: "백필 반영 중 일부 청크가 실패했습니다.",
      problem: {
        type: "about:blank",
        title: "t",
        status: 500,
        detail: "백필 반영 중 일부 청크가 실패했습니다.",
        code: "BACKFILL_APPLY_FAILED",
        applied: 500,
        range: "501~600",
      },
    });
    mocks.post.mockRejectedValue(failure);
    fireEvent.click(screen.getByLabelText(/영향받는 6행을 확인했습니다/));
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    await waitFor(() => expect(mocks.reportAdminError).toHaveBeenCalled());
    expect(mocks.reportAdminError).toHaveBeenCalledWith(
      "백필 적용 실패(501~600행). 이미 반영된 청크는 되돌려지지 않습니다",
      failure,
    );
    expect(onReload).toHaveBeenCalled();
  });

  test("서버가 4xx 중복으로 청크 실패를 알려도 앞 청크는 반영돼 있어 되돌려지지 않는다는 문구를 붙인다", async () => {
    const onReload = renderPanels();
    await screen.findByText(/전체 4건/);
    await computePreview();
    const failure = new ApiError({
      status: 409,
      code: "DB_UNIQUE_VIOLATION",
      detail: "이미 등록된 값입니다(중복).",
      problem: {
        type: "about:blank",
        title: "t",
        status: 409,
        detail: "이미 등록된 값입니다(중복).",
        code: "DB_UNIQUE_VIOLATION",
        applied: 500,
        range: "501~600",
        columns: [],
      },
    });
    mocks.post.mockRejectedValue(failure);
    fireEvent.click(screen.getByLabelText(/영향받는 6행을 확인했습니다/));
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    await waitFor(() => expect(mocks.reportAdminError).toHaveBeenCalled());
    expect(mocks.reportAdminError).toHaveBeenCalledWith(
      "백필 적용 실패(501~600행). 이미 반영된 청크는 되돌려지지 않습니다",
      failure,
    );
    expect(onReload).toHaveBeenCalled();
  });

  test("미리보기 이후 데이터가 바뀌어 409 면 미리보기를 닫고 다시 계산하라고 알린다", async () => {
    renderPanels();
    await screen.findByText(/전체 4건/);
    await computePreview();
    const stale = new ApiError({
      status: 409,
      code: "BACKFILL_PREVIEW_STALE",
      detail:
        "미리보기 이후 데이터가 바뀌었습니다. 미리보기를 다시 계산한 뒤 확인해 주세요.",
    });
    mocks.post.mockRejectedValue(stale);
    fireEvent.click(screen.getByLabelText(/영향받는 6행을 확인했습니다/));
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    await waitFor(() => expect(mocks.reportAdminError).toHaveBeenCalled());
    expect(mocks.reportAdminError).toHaveBeenCalledWith(
      "백필 적용 실패",
      stale,
    );
    expect(screen.queryByText(/생성 대상/)).not.toBeInTheDocument();
  });
});
