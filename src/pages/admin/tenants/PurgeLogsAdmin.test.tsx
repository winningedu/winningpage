// 삭제 로그 화면(사 #163, #177). 로그 목록을 보이고, 회원번호는 펼쳐서 보며, 파일에는 이름과 연락처 열이 없다.

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./api", () => ({
  fetchPurgeLogs: vi.fn(),
}));

const csv = vi.hoisted(() => ({ downloadCsv: vi.fn() }));
vi.mock("@/pages/admin/shared/csvExport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/pages/admin/shared/csvExport")>()),
  downloadCsv: csv.downloadCsv,
}));

import * as api from "./api";
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

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchPurgeLogs).mockResolvedValue({
    ok: true,
    data: { logs: [LOG] },
  });
});

describe("PurgeLogsAdmin", () => {
  test("삭제 로그를 실행 일시, 실행자, 기관, 계약 종료일, 삭제, 제외(유료 전환), 제외(직접) 건수로 보여 주고 회원번호는 펼쳐야 보인다", async () => {
    render(<PurgeLogsAdmin />);

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

  test("파일 내려받기는 같은 열로 만들고 이름이나 연락처 열이 없다", async () => {
    render(<PurgeLogsAdmin />);
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
