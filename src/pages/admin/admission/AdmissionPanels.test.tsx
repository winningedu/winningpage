import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  exportAdmissionResultRowsToXlsx: vi.fn(() => ({
    workbook: {},
    truncatedCells: [],
  })),
  parseAdmissionResultRowsFromXlsx: mocks.parseResults,
}));

import { ApiError } from "@/lib/http/client";
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

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
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
    expect(screen.getByText("공개 연도 확인 중…")).toBeTruthy();
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
        "엑셀 적용 실패",
        err,
      ),
    );
    expect(onReload).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox")).toBeTruthy();
  });
});
