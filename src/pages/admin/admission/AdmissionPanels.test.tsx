import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  reportAdminError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  confirmAdmin: vi.fn(),
  parseGuidelines: vi.fn(),
  parseResults: vi.fn(),
  exportResults: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));
vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: { get: mocks.get, put: mocks.put, post: mocks.post },
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
vi.mock("@/pages/admin/shared/confirmAdmin", () => ({
  confirmAdmin: mocks.confirmAdmin,
}));
vi.mock("@/pages/admin/shared/xlsxDownload", () => ({
  pad2: (n: number) => String(n).padStart(2, "0"),
  triggerXlsxDownload: vi.fn(),
}));
vi.mock("xlsx", () => ({ read: vi.fn(() => ({})) }));
vi.mock("@/lib/admissionBulkXlsx", () => ({
  exportAdmissionRowsToXlsx: vi.fn(() => ({
    workbook: {},
    truncatedCells: [],
  })),
  parseAdmissionRowsFromXlsx: mocks.parseGuidelines,
}));
vi.mock("@/lib/admissionResultsBulkXlsx", () => ({
  exportAdmissionResultRowsToXlsx: mocks.exportResults,
  parseAdmissionResultRowsFromXlsx: mocks.parseResults,
}));

import { ApiError } from "@/lib/http/client";
import { AdminChunkError } from "@/pages/admin/shared/adminErrors";
import { SectionEditAccessProvider } from "@/pages/admin/shared/sectionEditAccess";
import {
  AdmissionListSummary,
  AdmissionResultsListSummary,
} from "./AdmissionPanels";

const YEAR_PATH = "admin/admission/active-year";

/** ky 응답처럼 .json(schema)로 읽는 가짜 응답 */
function reply(body: unknown) {
  return {
    json: (schema: { parse: (v: unknown) => unknown }) =>
      Promise.resolve(schema.parse(body)),
  };
}
function fail(error: unknown) {
  return { json: () => Promise.reject(error) };
}
function notFound() {
  return new ApiError({
    status: 404,
    code: "NOT_FOUND",
    detail: "공개 연도가 아직 지정되지 않았습니다.",
  });
}

// 쓰기 흐름을 보는 기존 테스트는 edit 권한으로 연다. view 화면은 아래 「보기 권한」이 본다.
function wrap(ui: React.ReactElement, canEdit = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SectionEditAccessProvider value={canEdit}>
        {ui}
      </SectionEditAccessProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("공개 연도", () => {
  test("서버에서 읽은 연도와 해당 연도 학교 수를 보여 준다", async () => {
    mocks.get.mockImplementation((path: string) =>
      path === YEAR_PATH ? reply({ year: 2027 }) : fail(new Error(path)),
    );
    wrap(
      <AdmissionListSummary
        rows={[{ admission_year: 2027 }, { admission_year: 2026 }]}
        onReload={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("status", { name: "공개 연도를 확인하는 중" }),
    ).toBeTruthy();
    expect(await screen.findByText("2027학년도")).toBeTruthy();
    expect(
      (screen.getByLabelText("새 공개 연도") as HTMLInputElement).value,
    ).toBe("2027");
  });

  test("404 NOT_FOUND면 미지정 문구를 보이고 입력은 비어 있으며 저장은 가능하다", async () => {
    mocks.get.mockReturnValue(fail(notFound()));
    wrap(<AdmissionListSummary rows={[]} onReload={vi.fn()} />);
    expect(
      await screen.findByText("공개 연도가 지정되지 않았습니다"),
    ).toBeTruthy();
    const input = screen.getByLabelText("새 공개 연도") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.disabled).toBe(false);
    expect(
      (screen.getByRole("button", { name: "변경" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  test("그 밖의 조회 실패는 불러오지 못했다고 알린다", async () => {
    mocks.get.mockReturnValue(
      fail(new ApiError({ status: 500, code: "INTERNAL_ERROR", detail: "x" })),
    );
    wrap(<AdmissionListSummary rows={[]} onReload={vi.fn()} />);
    expect(
      await screen.findByText("공개 연도를 불러오지 못했습니다"),
    ).toBeTruthy();
  });

  test("저장하면 PUT 후 다시 읽은 연도로 토스트를 띄운다", async () => {
    let year = 2026;
    mocks.get.mockImplementation(() => reply({ year }));
    mocks.put.mockImplementation(
      (_p: string, opts: { json: { year: number } }) => {
        year = opts.json.year;
        return reply({ year });
      },
    );
    wrap(
      <AdmissionListSummary
        rows={[{ admission_year: 2026 }, { admission_year: 2027 }]}
        onReload={vi.fn()}
      />,
    );
    await screen.findByText("2026학년도");
    fireEvent.change(screen.getByLabelText("새 공개 연도"), {
      target: { value: "2027" },
    });
    fireEvent.click(screen.getByRole("button", { name: "변경" }));
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        "공개 연도를 2027학년도로 변경했습니다.",
      ),
    );
    expect(mocks.put).toHaveBeenCalledWith(YEAR_PATH, { json: { year: 2027 } });
    expect(await screen.findByText("2027학년도")).toBeTruthy();
  });

  test("저장 실패는 reportAdminError로 알린다", async () => {
    mocks.get.mockReturnValue(reply({ year: 2027 }));
    const err = new ApiError({
      status: 400,
      code: "VALIDATION_FAILED",
      detail: "연도는 2000~2100 사이 정수로 입력해 주세요.",
    });
    mocks.put.mockReturnValue(fail(err));
    wrap(
      <AdmissionListSummary
        rows={[{ admission_year: 2027 }]}
        onReload={vi.fn()}
      />,
    );
    await screen.findByText("2027학년도");
    fireEvent.click(screen.getByRole("button", { name: "변경" }));
    await waitFor(() =>
      expect(mocks.reportAdminError).toHaveBeenCalledWith(
        "공개 연도 저장 실패",
        err,
      ),
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});

const summary = {
  willInsert: 1,
  willUpdate: 1,
  willSkip: 0,
  warningCounts: {},
  newYears: [],
};

function pickFile(label: string) {
  const input = screen.getByLabelText(label) as HTMLInputElement;
  const file = new File(["x"], "a.xlsx");
  Object.assign(file, { arrayBuffer: async () => new ArrayBuffer(0) });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("모집요강 엑셀 적용", () => {
  const items = [
    { admission_year: 2027, university_key: "a" },
    { admission_year: 2027, university_key: "b" },
  ];

  async function openPreview(onReload = vi.fn()) {
    mocks.get.mockReturnValue(reply({ year: 2027 }));
    mocks.parseGuidelines.mockReturnValue({
      rows: items,
      errors: [],
      warnings: [],
      summary,
    });
    wrap(<AdmissionListSummary rows={[]} onReload={onReload} />);
    await screen.findByText("2027학년도");
    pickFile("모집요강 xlsx 파일 선택");
    fireEvent.click(await screen.findByRole("checkbox"));
    return onReload;
  }

  test("적용하면 { items: rows }를 PUT하고 목록을 다시 불러온다", async () => {
    mocks.put.mockReturnValue(reply({ upserted: 2 }));
    const onReload = await openPreview();
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        "엑셀 적용 완료",
        "신규 1건, 수정 1건, 거부 0건.",
      ),
    );
    expect(mocks.put).toHaveBeenCalledWith("admin/admission/guidelines/bulk", {
      json: { items },
    });
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  describe("큰 파일은 크기 기준으로 나눠 보낸다", () => {
    // 행 하나가 약 1.2MB라 3MB 한도에서 2행씩 묶인다
    const big = Array.from({ length: 5 }, (_, i) => ({
      admission_year: 2027,
      university_key: `u${i}`,
      html: "x".repeat(1_200_000),
    }));

    async function openBigPreview() {
      mocks.get.mockReturnValue(reply({ year: 2027 }));
      mocks.parseGuidelines.mockReturnValue({
        rows: big,
        errors: [],
        warnings: [],
        summary,
      });
      const onReload = vi.fn();
      wrap(<AdmissionListSummary rows={[]} onReload={onReload} />);
      await screen.findByText("2027학년도");
      pickFile("모집요강 xlsx 파일 선택");
      fireEvent.click(await screen.findByRole("checkbox"));
      return onReload;
    }

    test("같은 경로로 순서대로 여러 번 PUT하고 목록은 한 번만 다시 읽는다", async () => {
      mocks.put.mockImplementation(() => reply({ upserted: 0 }));
      const onReload = await openBigPreview();
      fireEvent.click(screen.getByRole("button", { name: "적용" }));
      await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
      const bodies = mocks.put.mock.calls.map(([path, opts]) => {
        expect(path).toBe("admin/admission/guidelines/bulk");
        return opts.json.items as typeof big;
      });
      expect(bodies.map((b) => b.length)).toEqual([2, 2, 1]);
      expect(bodies.flat()).toEqual(big);
      expect(onReload).toHaveBeenCalledTimes(1);
    });

    test("둘째 청크가 실패하면 행 범위를 붙여 알리고 멈춘다", async () => {
      const err = new ApiError({
        status: 400,
        code: "VALIDATION_FAILED",
        detail: "1번째 행: 오류",
      });
      mocks.put
        .mockReturnValueOnce(reply({ upserted: 2 }))
        .mockReturnValueOnce(fail(err));
      const onReload = await openBigPreview();
      fireEvent.click(screen.getByRole("button", { name: "적용" }));
      await waitFor(() => expect(mocks.reportAdminError).toHaveBeenCalled());
      const [label, reported] = mocks.reportAdminError.mock.calls[0] ?? [];
      expect(label).toBe(
        "엑셀 적용 실패(3~4행). 이미 반영된 청크는 되돌려지지 않습니다",
      );
      expect(reported).toBeInstanceOf(AdminChunkError);
      expect(mocks.put).toHaveBeenCalledTimes(2);
      expect(onReload).toHaveBeenCalledTimes(1);
      expect(mocks.toastSuccess).not.toHaveBeenCalled();
    });
  });

  test("서버가 행을 거부하면 reportAdminError로 알리고 미리보기를 유지한다", async () => {
    const err = new ApiError({
      status: 400,
      code: "VALIDATION_FAILED",
      detail: "2번째 행: university_name이 비어 있습니다.",
    });
    mocks.put.mockReturnValue(fail(err));
    const onReload = await openPreview();
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    await waitFor(() =>
      expect(mocks.reportAdminError).toHaveBeenCalledWith(
        "엑셀 적용 실패(1~2행). 이미 반영된 청크는 되돌려지지 않습니다",
        expect.objectContaining({ cause: err }),
      ),
    );
    expect(onReload).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox")).toBeTruthy();
  });
});

const COUNT_PATH = "admin/admission/results/count";
const ROWS_PATH = "admin/admission/results/rows";
const BULK_PATH = "admin/admission/results/bulk";

describe("입결정보 엑셀", () => {
  function stubResults(total: number) {
    mocks.exportResults.mockReturnValue({ workbook: {}, truncatedCells: [] });
    mocks.get.mockImplementation(
      (path: string, opts?: { searchParams?: { offset: number } }) => {
        if (path === COUNT_PATH) return reply({ total });
        if (path === ROWS_PATH) {
          const offset = opts?.searchParams?.offset ?? 0;
          const n = Math.max(0, Math.min(1000, total - offset));
          return reply({
            items: Array.from({ length: n }, (_, i) => ({
              id: offset + i + 1,
            })),
          });
        }
        return fail(new Error(path));
      },
    );
  }

  test("다운로드 버튼에 전체 행 수를 보여 준다", async () => {
    stubResults(2500);
    wrap(<AdmissionResultsListSummary onReload={vi.fn()} />);
    expect(
      await screen.findByRole("button", {
        name: "엑셀 다운로드 (전체 2,500행)",
      }),
    ).toBeTruthy();
  });

  test("다운로드는 offset을 1000씩 올려 전량을 읽는다", async () => {
    stubResults(2500);
    wrap(<AdmissionResultsListSummary onReload={vi.fn()} />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "엑셀 다운로드 (전체 2,500행)",
      }),
    );
    await waitFor(() => expect(mocks.exportResults).toHaveBeenCalledTimes(1));
    const offsets = mocks.get.mock.calls
      .filter(([path]) => path === ROWS_PATH)
      .map(([, opts]) => opts?.searchParams);
    expect(offsets).toEqual([
      { offset: 0, fields: "all" },
      { offset: 1000, fields: "all" },
      { offset: 2000, fields: "all" },
    ]);
    expect(mocks.exportResults.mock.calls[0]?.[0]).toHaveLength(2500);
  });

  describe("적용", () => {
    const inserts = Array.from({ length: 1100 }, (_, i) => ({ k: i }));
    const updates = Array.from({ length: 600 }, (_, i) => ({
      id: i + 1,
      k: i,
    }));

    async function openPreview(onReload = vi.fn()) {
      stubResults(3);
      mocks.parseResults.mockReturnValue({
        // 일부러 update를 앞에 둬서 insert가 먼저 나가는지 본다
        rows: [...updates, ...inserts],
        errors: [],
        warnings: [],
        summary: { ...summary, willInsert: 1100, willUpdate: 600 },
      });
      wrap(<AdmissionResultsListSummary onReload={onReload} />);
      await screen.findByRole("button", { name: "엑셀 다운로드 (전체 3행)" });
      pickFile("입결정보 xlsx 파일 선택");
      fireEvent.click(await screen.findByRole("checkbox"));
      return onReload;
    }

    test("신규는 500행씩 먼저, 수정은 500행씩 나중에 POST하고 목록과 건수를 새로 읽는다", async () => {
      mocks.post.mockImplementation(() => reply({ inserted: 0, updated: 0 }));
      const onReload = await openPreview();
      fireEvent.click(screen.getByRole("button", { name: "적용" }));
      await waitFor(() =>
        expect(mocks.toastSuccess).toHaveBeenCalledWith(
          "엑셀 적용 완료",
          "신규 1100건, 수정 600건, 거부 0건.",
        ),
      );
      const bodies = mocks.post.mock.calls.map(([path, opts]) => {
        expect(path).toBe(BULK_PATH);
        return opts.json.items as { id?: number }[];
      });
      expect(bodies.map((b) => b.length)).toEqual([500, 500, 100, 500, 100]);
      expect(
        bodies.slice(0, 3).every((b) => b.every((r) => !("id" in r))),
      ).toBe(true);
      expect(bodies.slice(3).every((b) => b.every((r) => "id" in r))).toBe(
        true,
      );
      expect(onReload).toHaveBeenCalledTimes(1);
      await waitFor(() =>
        expect(
          mocks.get.mock.calls.filter(([p]) => p === COUNT_PATH).length,
        ).toBeGreaterThan(2),
      );
    });

    test("청크가 실패하면 행 범위를 붙여 알리고 이미 반영된 청크 안내와 함께 목록을 다시 읽는다", async () => {
      const err = new ApiError({
        status: 400,
        code: "VALIDATION_FAILED",
        detail: "1번째 행: 오류",
      });
      mocks.post
        .mockReturnValueOnce(reply({ inserted: 0, updated: 0 }))
        .mockReturnValueOnce(fail(err));
      const onReload = await openPreview();
      fireEvent.click(screen.getByRole("button", { name: "적용" }));
      await waitFor(() => expect(mocks.reportAdminError).toHaveBeenCalled());
      const [label, reported] = mocks.reportAdminError.mock.calls[0] ?? [];
      expect(label).toBe(
        "엑셀 적용 실패(501~1000행). 이미 반영된 청크는 되돌려지지 않습니다",
      );
      expect(reported).toBeInstanceOf(AdminChunkError);
      expect(mocks.post).toHaveBeenCalledTimes(2);
      expect(onReload).toHaveBeenCalledTimes(1);
      expect(mocks.toastSuccess).not.toHaveBeenCalled();
    });
  });
});

describe("보기 권한", () => {
  function stubYear() {
    mocks.get.mockImplementation((path: string) => {
      if (path === YEAR_PATH) return reply({ year: 2026 });
      if (path === COUNT_PATH) return reply({ total: 0 });
      if (path === ROWS_PATH) return reply({ items: [] });
      return fail(new Error(path));
    });
  }

  test("view 권한이면 모집요강 요약에 공개 연도 변경과 엑셀 업로드가 없고 다운로드는 있다", async () => {
    stubYear();
    wrap(<AdmissionListSummary rows={[]} onReload={vi.fn()} />, false);

    expect(await screen.findByText("2026학년도")).toBeTruthy();
    expect(screen.getByRole("button", { name: /엑셀 다운로드/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "변경" })).toBeNull();
    expect(screen.queryByLabelText("새 공개 연도")).toBeNull();
    expect(screen.queryByRole("button", { name: "엑셀 업로드" })).toBeNull();
    expect(screen.queryByLabelText("모집요강 xlsx 파일 선택")).toBeNull();
  });

  test("edit 권한이면 모집요강 요약에 공개 연도 변경과 엑셀 업로드가 있다", async () => {
    stubYear();
    wrap(<AdmissionListSummary rows={[]} onReload={vi.fn()} />);

    expect(await screen.findByText("2026학년도")).toBeTruthy();
    expect(screen.getByRole("button", { name: "변경" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "엑셀 업로드" })).toBeTruthy();
  });

  test("view 권한이면 입결정보 요약에 엑셀 업로드가 없고 다운로드는 있다", async () => {
    stubYear();
    wrap(<AdmissionResultsListSummary onReload={vi.fn()} />, false);

    expect(
      await screen.findByRole("button", { name: /엑셀 다운로드/ }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "엑셀 업로드" })).toBeNull();
    expect(screen.queryByLabelText("입결정보 xlsx 파일 선택")).toBeNull();
  });

  test("edit 권한이면 입결정보 요약에 엑셀 업로드가 있다", async () => {
    stubYear();
    wrap(<AdmissionResultsListSummary onReload={vi.fn()} />);

    expect(
      await screen.findByRole("button", { name: "엑셀 업로드" }),
    ).toBeTruthy();
  });
});
