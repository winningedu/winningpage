// 매출 및 결제 화면의 기간 조회는 브라우저 시간대의 하루 경계를 UTC 순간으로 바꿔 보낸다.

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const zone = vi.hoisted(() => ({ current: "Asia/Seoul" }));
const calls = vi.hoisted(() => ({
  gte: [] as string[],
  lt: [] as string[],
}));

vi.mock("@/lib/time/zone", () => ({
  browserTimeZone: () => zone.current,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => {
      const proxy: unknown = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "then") {
              return (resolve: (v: unknown) => void) =>
                resolve({ data: [], error: null, count: 0 });
            }
            if (prop === "gte") {
              return (_col: string, value: string) => {
                calls.gte.push(value);
                return proxy;
              };
            }
            if (prop === "lt") {
              return (_col: string, value: string) => {
                calls.lt.push(value);
                return proxy;
              };
            }
            return () => proxy;
          },
        },
      );
      return proxy;
    },
  },
}));

import RevenueAdmin from "./RevenueAdmin";

beforeEach(() => {
  calls.gte.length = 0;
  calls.lt.length = 0;
});

afterEach(cleanup);

async function search(from: string, to: string) {
  render(<RevenueAdmin />);
  await screen.findByText("이 기간에 결제 내역이 없습니다.");
  calls.gte.length = 0;
  calls.lt.length = 0;
  fireEvent.change(screen.getByLabelText("조회 시작일"), {
    target: { value: from },
  });
  fireEvent.change(screen.getByLabelText("조회 종료일"), {
    target: { value: to },
  });
  fireEvent.click(screen.getByRole("button", { name: "조회" }));
  await screen.findByText("이 기간에 결제 내역이 없습니다.");
  // 호출 순서는 [이번 달, 선택 기간] 이다.
  return { from: calls.gte[1], toExclusive: calls.lt[1] };
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
