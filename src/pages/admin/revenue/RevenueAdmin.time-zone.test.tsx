// 매출 및 결제 화면의 기간 조회는 브라우저 시간대의 하루 경계를 UTC 순간으로 바꿔 보낸다.

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const zone = vi.hoisted(() => ({ current: "Asia/Seoul" }));
const get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/time/zone", () => ({
  browserTimeZone: () => zone.current,
}));

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: { get },
}));

import RevenueAdmin from "./RevenueAdmin";

beforeEach(() => {
  get.mockReset();
  get.mockImplementation((path: string) => ({
    json: async () => {
      if (path === "admin/revenue") return { items: [] };
      if (path === "admin/revenue/services") return { items: [] };
      return { approvalWaiting: 0, processWaiting: 0 };
    },
  }));
});

// 호출 순서는 [이번 달, 선택 기간] 이다.
function revenueRanges() {
  return get.mock.calls
    .filter(([path]) => path === "admin/revenue")
    .map(([, options]) => ({
      from: options.searchParams.from as string,
      toExclusive: options.searchParams.to as string,
    }));
}

function renderAt(url: string) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[url]}>
        <RevenueAdmin />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

async function search(from: string, to: string) {
  renderAt("/admin/revenue");
  await screen.findByText("이 기간에 결제 내역이 없습니다.");
  get.mockClear();
  fireEvent.change(screen.getByLabelText("조회 시작일"), {
    target: { value: from },
  });
  fireEvent.change(screen.getByLabelText("조회 종료일"), {
    target: { value: to },
  });
  fireEvent.click(screen.getByRole("button", { name: "조회" }));
  await waitFor(() =>
    expect(revenueRanges().some((range) => range.from.length > 0)).toBe(true),
  );
  await screen.findByText("이 기간에 결제 내역이 없습니다.");
  return revenueRanges().at(-1) as { from: string; toExclusive: string };
}

test("서울 11월 한 달은 [10-31T15:00Z, 11-30T15:00Z) 로 조회한다", async () => {
  zone.current = "Asia/Seoul";

  const range = await search("2026-11-01", "2026-11-30");

  expect(range).toEqual({
    from: "2026-10-31T15:00:00.000Z",
    toExclusive: "2026-11-30T15:00:00.000Z",
  });
});

test("로스앤젤레스에서는 같은 날짜가 다른 순간으로 바뀐다", async () => {
  zone.current = "America/Los_Angeles";

  const range = await search("2026-11-01", "2026-11-30");

  expect(range).toEqual({
    from: "2026-11-01T07:00:00.000Z",
    toExclusive: "2026-12-01T08:00:00.000Z",
  });
});

test("상한은 23:59:59 가 아니라 다음 날 0시 미만이라 마지막 날 밤 결제를 포함한다", async () => {
  zone.current = "Asia/Seoul";

  const range = await search("2026-11-01", "2026-11-30");
  const lastMoment = Date.parse("2026-11-30T14:59:59.999Z");
  const nextMidnight = Date.parse("2026-11-30T15:00:00.000Z");

  expect(lastMoment).toBeGreaterThanOrEqual(Date.parse(range.from as string));
  expect(lastMoment).toBeLessThan(Date.parse(range.toExclusive as string));
  expect(nextMidnight).not.toBeLessThan(
    Date.parse(range.toExclusive as string),
  );
});
