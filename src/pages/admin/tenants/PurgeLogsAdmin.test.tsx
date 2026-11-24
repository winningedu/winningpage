// 삭제 로그 화면(사 #163, #177). 로그 목록을 보이고, 회원번호는 펼쳐서 보며, 파일에는 이름과 연락처 열이 없다.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const http = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: http,
}));

const zone = vi.hoisted(() => ({ tz: "Asia/Seoul" }));
vi.mock("@/lib/time/zone", () => ({ browserTimeZone: () => zone.tz }));

const csv = vi.hoisted(() => ({ downloadCsv: vi.fn() }));
vi.mock("@/pages/admin/shared/csvExport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/pages/admin/shared/csvExport")>()),
  downloadCsv: csv.downloadCsv,
}));

import { ApiError } from "@/lib/http/client";
import PurgeLogsAdmin from "./PurgeLogsAdmin";

const LOG = {
  id: "log-1",
  executedAt: "2026-11-05T19:40:00Z",
  executedBy: "hq@example.com",
  tenant: { id: "tenant-7", code: "ABCD1234", name: "한빛고" },
  contractEndDate: "2026-09-01",
  deletedCount: 2,
  excludedCount: 1,
  skippedCount: 3,
  memberIds: ["m-1", "m-2"],
};

// ky 응답처럼 .json(schema)로 바디를 검증해 돌려준다.
const reply = (body: unknown) => ({
  json: async (schema: { parse: (value: unknown) => unknown }) =>
    schema.parse(body),
});

function renderLogs() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PurgeLogsAdmin />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  http.get.mockReturnValue(reply({ items: [LOG] }));
});

describe("PurgeLogsAdmin", () => {
  test("삭제 로그를 실행 일시, 실행자, 기관, 계약 종료일, 삭제, 제외(유료 전환), 제외(직접) 건수로 보여 주고 회원번호는 펼쳐야 보인다", async () => {
    renderLogs();

    const row = (await screen.findByText("한빛고")).closest(
      "tr",
    ) as HTMLElement;
    expect(within(row).getByText("hq@example.com")).toBeTruthy();
    expect(within(row).getByText("2026-09-01")).toBeTruthy();
    expect(within(row).getByText("2026. 11. 06. 04:40")).toBeTruthy();
    expect(screen.getByText("제외(유료 전환) 건수")).toBeTruthy();
    expect(screen.getByText("제외(직접) 건수")).toBeTruthy();
    expect(within(row).getByText("3")).toBeTruthy();
    expect(screen.queryByText("m-1")).toBeNull();

    fireEvent.click(within(row).getByRole("button", { name: "회원번호 보기" }));

    expect(screen.getByText("m-1")).toBeTruthy();
    expect(screen.getByText("m-2")).toBeTruthy();
  });

  test("admin/tenants/purge-logs 를 signal 과 함께 읽는다", async () => {
    renderLogs();
    await screen.findByText("한빛고");
    expect(http.get).toHaveBeenCalledWith(
      "admin/tenants/purge-logs",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  test("불러오기에 실패하면 서버가 준 안내를 보여 준다", async () => {
    http.get.mockReturnValue({
      json: async () => {
        throw new ApiError({
          status: 403,
          code: "FORBIDDEN",
          detail: "권한이 없어요.",
        });
      },
    });
    renderLogs();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "권한이 없어요.",
    );
  });

  test("열 머리글은 scope col 을 가진다", async () => {
    renderLogs();
    await screen.findByText("한빛고");
    expect(screen.getByRole("columnheader", { name: "기관" })).toHaveAttribute(
      "scope",
      "col",
    );
  });

  test("파일 내려받기는 같은 열로 만들고 이름이나 연락처 열이 없다", async () => {
    renderLogs();
    await screen.findByText("한빛고");

    fireEvent.click(screen.getByRole("button", { name: /파일 내려받기/ }));

    expect(csv.downloadCsv).toHaveBeenCalledTimes(1);
    const [filename, rows, columns] = csv.downloadCsv.mock.calls[0] as [
      string,
      Record<string, unknown>[],
      { key: string; label: string }[],
    ];
    expect(filename).toBe("member-purge-logs.csv");
    expect(columns.map((c) => c.label)).toEqual([
      "실행 일시",
      "실행자",
      "기관",
      "계약 종료일",
      "삭제 건수",
      "제외(유료 전환) 건수",
      "제외(직접) 건수",
      "회원번호",
    ]);
    expect(columns.map((c) => c.label).join()).not.toMatch(/이름|전화|연락처/);
    expect(rows).toEqual([
      {
        executedAt: "2026-11-05T19:40:00Z",
        executedBy: "hq@example.com",
        tenantName: "한빛고",
        contractEndDate: "2026-09-01",
        deletedCount: 2,
        excludedCount: 1,
        skippedCount: 3,
        memberIds: "m-1 m-2",
      },
    ]);
  });
});
