import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { apiFetchMock, getAuthHeaderMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  getAuthHeaderMock: vi.fn(),
}));

vi.mock("../apiFetch", async () => {
  const actual =
    await vi.importActual<typeof import("../apiFetch")>("../apiFetch");
  return {
    ...actual,
    apiFetch: apiFetchMock,
    getAuthHeader: getAuthHeaderMock,
  };
});

import { fetchChildReportDetail, fetchChildReports } from "./api";

const CID = "22222222-2222-4222-8222-222222222222";
const RID = "11111111-1111-4111-8111-111111111111";

function jsonResponse(status: number, body: unknown) {
  return { status, json: async () => body } as Response;
}

beforeEach(() => {
  getAuthHeaderMock.mockResolvedValue({ Authorization: "Bearer tok" });
});
afterEach(() => {
  apiFetchMock.mockReset();
  getAuthHeaderMock.mockReset();
});

describe("학부모 열람 API", () => {
  test("fetchChildReports 는 childId 쿼리로 GET 한다", async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        items: [],
        child: { id: CID, name: null },
      }),
    );
    const result = await fetchChildReports(CID);
    expect(result.kind).toBe("ok");
    expect(apiFetchMock.mock.calls[0]?.[0]).toBe(
      `/api/growth/reports?childId=${CID}`,
    );
  });

  test("fetchChildReportDetail 은 reportId, childId, view=parent 를 붙인다", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { ok: true, report: {} }));
    await fetchChildReportDetail(CID, RID);
    expect(apiFetchMock.mock.calls[0]?.[0]).toBe(
      `/api/growth/reports?reportId=${RID}&childId=${CID}&view=parent`,
    );
  });

  test("403 NOT_LINKED 는 오류로 돌려준다", async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse(403, { ok: false, code: "NOT_LINKED", error: "no" }),
    );
    const result = await fetchChildReports(CID);
    expect(result).toMatchObject({
      kind: "error",
      status: 403,
      code: "NOT_LINKED",
    });
  });
});
