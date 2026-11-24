import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

const http = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/http/client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/http/client")>()),
  api: { get: http.get },
}));

import { ApiError } from "@/lib/http/client";
import AccessLogsAdmin from "./AccessLogsAdmin";
import type { AccessLogEntry } from "./api";

const ENTRY: AccessLogEntry = {
  id: "log-1",
  createdAt: "2026-11-05T10:00:00Z",
  tenantCode: "ABCD1234",
  actorName: null,
  actorEmail: null,
  reason: null,
  teacherName: "박교사",
  teacherLoginId: "ABCD1234a1b2c3",
  teacherPhone: "010-****-1234",
  kind: "view",
  kindLabel: "조회",
  targetStudentName: "김*늘",
  content: "학생 상세",
  isProxy: false,
};

type PageBody = { items: AccessLogEntry[]; page: number; hasNext: boolean };

// api.get(...).json(schema) 체인을 흉내 낸다. 본문은 실제 스키마로 검증한다.
function respondWith(page: PageBody) {
  return {
    json: async (schema: { parse: (value: unknown) => unknown }) =>
      schema.parse(page),
  };
}

function failWith(error: unknown) {
  return {
    json: async () => {
      throw error;
    },
  };
}

function lastParams(): URLSearchParams {
  const init = http.get.mock.lastCall?.[1] as {
    searchParams: Record<string, string>;
  };
  return new URLSearchParams(init.searchParams);
}

function LocationProbe() {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
}

function renderScreen(initialEntry = "/admin/adminAccessLogs") {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[initialEntry]}>
        <AccessLogsAdmin />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  http.get.mockReset();
  http.get.mockReturnValue(
    respondWith({ items: [ENTRY], page: 1, hasNext: false }),
  );
});

describe("AccessLogsAdmin", () => {
  test("API 가 준 로그를 소속코드, 교사, 전화, 구분, 대상 학생, 내용 열로 보여 준다", async () => {
    renderScreen();

    const row = (await screen.findByText("박교사")).closest("tr");
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement);
    expect(cells.getByText("ABCD1234")).toBeInTheDocument();
    expect(cells.getByText("ABCD1234a1b2c3")).toBeInTheDocument();
    expect(cells.getByText("010-****-1234")).toBeInTheDocument();
    expect(cells.getByText("조회")).toBeInTheDocument();
    expect(cells.getByText("김*늘")).toBeInTheDocument();
    expect(cells.getByText("학생 상세")).toBeInTheDocument();
    for (const header of [
      "일시",
      "소속코드",
      "선생님 이름",
      "선생님 코드",
      "선생님 전화번호",
      "구분",
      "대상 학생",
      "내용",
      "대행 여부",
    ]) {
      expect(
        screen.getByRole("columnheader", { name: header }),
      ).toBeInTheDocument();
    }
    await waitFor(() => expect(http.get).toHaveBeenCalled());
    expect(http.get.mock.calls[0]?.[0]).toBe("admin/access-logs");
    expect(Object.fromEntries(lastParams())).toEqual({ page: "1" });
  });

  test("열 머리글은 scope col 을 가진다", async () => {
    renderScreen();
    const header = await screen.findByRole("columnheader", { name: "일시" });
    expect(header).toHaveAttribute("scope", "col");
  });

  test("본사 대행 줄과 본사 다운로드 줄은 관리자 이름, 이메일, 사유를 보여 준다", async () => {
    const proxy: AccessLogEntry = {
      ...ENTRY,
      id: "log-proxy",
      teacherName: null,
      teacherLoginId: null,
      teacherPhone: null,
      actorName: "본사직원",
      actorEmail: "hq@example.com",
      reason: "교사 문의 대응",
      kind: "proxy",
      kindLabel: "대행",
      content: "본사 대행",
      isProxy: true,
    };
    const download: AccessLogEntry = {
      ...proxy,
      id: "log-download",
      actorName: "다운직원",
      actorEmail: "down@example.com",
      reason: "정산 확인",
      kind: "export",
      kindLabel: "출력",
      content: "회원 목록",
      isProxy: false,
    };
    http.get.mockReturnValue(
      respondWith({ items: [proxy, download], page: 1, hasNext: false }),
    );
    renderScreen();

    const proxyRow = (await screen.findByText("본사직원")).closest("tr");
    const proxyCells = within(proxyRow as HTMLElement);
    expect(proxyCells.getByText("hq@example.com")).toBeInTheDocument();
    expect(proxyCells.getByText("교사 문의 대응")).toBeInTheDocument();
    const downloadRow = screen.getByText("다운직원").closest("tr");
    const downloadCells = within(downloadRow as HTMLElement);
    expect(downloadCells.getByText("down@example.com")).toBeInTheDocument();
    expect(downloadCells.getByText("정산 확인")).toBeInTheDocument();
    expect(downloadCells.getByText("출력")).toBeInTheDocument();
    for (const header of ["관리자", "사유"]) {
      expect(
        screen.getByRole("columnheader", { name: header }),
      ).toBeInTheDocument();
    }
  });

  test("쪽을 넘기다 실패하면 이전 쪽 목록을 지우고 오류만 보인다", async () => {
    http.get.mockReturnValueOnce(
      respondWith({ items: [ENTRY], page: 1, hasNext: true }),
    );
    renderScreen();
    await screen.findByText("박교사");

    http.get.mockReturnValueOnce(
      failWith(
        new ApiError({
          status: 500,
          code: "INTERNAL_ERROR",
          detail: "불러오지 못했습니다.",
        }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    expect(await screen.findByText("불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.queryByText("박교사")).not.toBeInTheDocument();
  });

  test("소속코드, 기간, 구분을 골라 조회하면 그 조건으로 1쪽을 다시 읽는다", async () => {
    renderScreen();
    await screen.findByText("박교사");

    fireEvent.change(screen.getByLabelText("소속코드"), {
      target: { value: "ABCD1234" },
    });
    fireEvent.change(screen.getByLabelText("시작일"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.change(screen.getByLabelText("종료일"), {
      target: { value: "2026-11-05" },
    });
    fireEvent.change(screen.getByLabelText("구분"), {
      target: { value: "edit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "조회" }));

    await waitFor(() =>
      expect(Object.fromEntries(lastParams())).toMatchObject({
        tenantCode: "ABCD1234",
        kind: "edit",
        page: "1",
      }),
    );
    expect(lastParams().get("from")).not.toBeNull();
    expect(lastParams().get("to")).not.toBeNull();
  });

  test("다음 쪽이 있으면 다음 버튼으로 같은 조건의 다음 쪽을 읽고 첫 쪽에서는 이전이 막힌다", async () => {
    http.get.mockReturnValue(
      respondWith({ items: [ENTRY], page: 1, hasNext: true }),
    );
    renderScreen();
    await screen.findByText("박교사");

    expect(screen.getByRole("button", { name: "이전" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    await waitFor(() => expect(lastParams().get("page")).toBe("2"));
  });

  test("주소의 검색 조건으로 시작해 그 조건과 쪽으로 읽는다", async () => {
    renderScreen(
      "/admin/adminAccessLogs?tenantCode=ABCD1234&kind=edit&from=2026-11-01&to=2026-11-05&page=3",
    );
    await screen.findByText("박교사");

    expect(lastParams().get("tenantCode")).toBe("ABCD1234");
    expect(lastParams().get("kind")).toBe("edit");
    expect(lastParams().get("page")).toBe("3");
    expect(lastParams().get("from")).not.toBeNull();
    expect(screen.getByLabelText("소속코드")).toHaveValue("ABCD1234");
    expect(screen.getByLabelText("시작일")).toHaveValue("2026-11-01");
    expect(screen.getByLabelText("구분")).toHaveValue("edit");
    expect(screen.getByText("3쪽")).toBeInTheDocument();
  });

  test("조회하면 조건이 주소에 1쪽으로 써지고, 쪽 이동도 주소에 써진다", async () => {
    http.get.mockReturnValue(
      respondWith({ items: [ENTRY], page: 1, hasNext: true }),
    );
    renderScreen("/admin/adminAccessLogs?page=4");
    await screen.findByText("박교사");

    fireEvent.change(screen.getByLabelText("소속코드"), {
      target: { value: "ABCD1234" },
    });
    fireEvent.change(screen.getByLabelText("구분"), {
      target: { value: "proxy" },
    });
    fireEvent.click(screen.getByRole("button", { name: "조회" }));
    await waitFor(() => {
      const search = new URLSearchParams(
        screen.getByTestId("search").textContent ?? "",
      );
      expect(search.get("tenantCode")).toBe("ABCD1234");
      expect(search.get("kind")).toBe("proxy");
      expect(search.get("page")).toBe("1");
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "다음" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    await waitFor(() =>
      expect(
        new URLSearchParams(screen.getByTestId("search").textContent ?? "").get(
          "page",
        ),
      ).toBe("2"),
    );
  });

  test("마지막 쪽에서는 다음이 막힌다", async () => {
    renderScreen();
    await screen.findByText("박교사");

    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
  });

  test("ApiError 가 아닌 실패는 기본 문구를 보인다", async () => {
    http.get.mockReturnValue(failWith(new Error("boom")));
    renderScreen();

    expect(
      await screen.findByText("접근 로그를 불러오지 못했습니다."),
    ).toBeInTheDocument();
  });

  test("기록이 없으면 안내를 보이고, 실패하면 서버 메시지를 보인다", async () => {
    http.get.mockReturnValueOnce(
      respondWith({ items: [], page: 1, hasNext: false }),
    );
    const { unmount } = renderScreen();
    expect(await screen.findByText("기록이 없어요.")).toBeInTheDocument();
    unmount();

    http.get.mockReturnValueOnce(
      failWith(
        new ApiError({
          status: 403,
          code: "FORBIDDEN",
          detail: "최고 관리자만 볼 수 있습니다.",
        }),
      ),
    );
    renderScreen();
    expect(
      await screen.findByText("최고 관리자만 볼 수 있습니다."),
    ).toBeInTheDocument();
  });
});
