import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  type AiTelemetryQuery,
  buildCallsSearch,
  buildCitationsSearch,
  buildSummarySearch,
  defaultRange,
  readQuery,
  withFilters,
  withPage,
  withTab,
} from "./query";

const zone = vi.hoisted(() => ({ value: "Asia/Seoul" }));
vi.mock("../../../lib/time/zone", () => ({
  browserTimeZone: () => zone.value,
}));

beforeEach(() => {
  zone.value = "Asia/Seoul";
});

const NOW = new Date("2026-10-06T16:00:00Z");

describe("defaultRange", () => {
  test("브라우저 시간대의 오늘과 29일 전을 날짜 문자열로 돌려준다", () => {
    // UTC 2026-10-06 16:00 은 서울로 2026-10-07 01:00 이다.
    expect(defaultRange(NOW)).toEqual({ from: "2026-09-08", to: "2026-10-07" });
  });

  test("시간대가 UTC 면 UTC 날짜 기준이다", () => {
    zone.value = "UTC";
    expect(defaultRange(NOW)).toEqual({ from: "2026-09-07", to: "2026-10-06" });
  });
});

describe("주소 검색 파라미터", () => {
  const read = (search: string) => readQuery(new URLSearchParams(search), NOW);

  test("주소가 비면 요약 탭, 기본 기간, 빈 필터, 1페이지다", () => {
    const state = read("");
    expect(state.tab).toBe("summary");
    expect(state.applied).toEqual({
      from: "2026-09-08",
      to: "2026-10-07",
      service: "",
      feature: "",
      status: "",
      retriedOnly: false,
      kind: "",
    });
    expect(state.page).toBe(1);
    expect(state.pageSize).toBe(20);
  });

  test("주소의 값을 그대로 읽는다", () => {
    const state = read(
      "tab=calls&from=2026-10-01&to=2026-10-05&service=growth&feature=r&status=error&retried=1&kind=embed&page=3",
    );
    expect(state.tab).toBe("calls");
    expect(state.page).toBe(3);
    expect(state.applied).toEqual({
      from: "2026-10-01",
      to: "2026-10-05",
      service: "growth",
      feature: "r",
      status: "error",
      retriedOnly: true,
      kind: "embed",
    });
  });

  test.each(["page=0", "page=-1", "page=1.5", "page=abc"])(
    "잘못된 %s 는 1페이지로 읽는다",
    (search) => expect(read(search).page).toBe(1),
  );

  test("모르는 탭은 요약으로 읽는다", () => {
    expect(read("tab=nope").tab).toBe("summary");
  });

  test("withFilters 는 필터를 적고 빈 값은 지우고 page 를 지운다", () => {
    const next = withFilters(
      new URLSearchParams("tab=calls&page=4&service=growth&retried=1"),
      {
        from: "2026-10-01",
        to: "2026-10-05",
        service: "",
        feature: " x ",
        status: "",
        retriedOnly: false,
        kind: "embed",
      },
    );
    expect(Object.fromEntries(next)).toEqual({
      tab: "calls",
      from: "2026-10-01",
      to: "2026-10-05",
      feature: "x",
      kind: "embed",
    });
  });

  test("withTab 은 필터와 page 를 두고 요약이면 tab 을 지운다", () => {
    const base = new URLSearchParams("from=2026-10-01&page=3");
    expect(Object.fromEntries(withTab(base, "calls"))).toEqual({
      from: "2026-10-01",
      page: "3",
      tab: "calls",
    });
    expect(
      withTab(new URLSearchParams("tab=calls"), "summary").has("tab"),
    ).toBe(false);
  });

  test("withPage 는 1 미만으로 내려가지 않고 1쪽이면 page 를 지운다", () => {
    expect(withPage(new URLSearchParams(), 4).get("page")).toBe("4");
    expect(withPage(new URLSearchParams("page=4"), -2).has("page")).toBe(false);
  });
});

describe("search 빌더", () => {
  const initial = readQuery(new URLSearchParams(), NOW);
  const filtered: AiTelemetryQuery = {
    ...initial,
    page: 2,
    applied: {
      from: "2026-10-01",
      to: "2026-10-05",
      service: "growth",
      feature: "report",
      status: "error",
      retriedOnly: true,
      kind: "generate",
    },
  };

  test("요약은 view, 기간, 서비스만 담는다", () => {
    expect(buildSummarySearch(filtered)).toBe(
      "view=summary&from=2026-10-01&to=2026-10-05&service=growth",
    );
  });

  test("요약에서 서비스가 비면 service 를 생략한다", () => {
    expect(buildSummarySearch(initial)).toBe(
      "view=summary&from=2026-09-08&to=2026-10-07",
    );
  });

  test("호출 목록은 추가 필터와 페이지를 담는다", () => {
    const params = new URLSearchParams(buildCallsSearch(filtered));
    expect(Object.fromEntries(params)).toEqual({
      view: "calls",
      from: "2026-10-01",
      to: "2026-10-05",
      service: "growth",
      feature: "report",
      status: "error",
      retried: "1",
      kind: "generate",
      page: "2",
      pageSize: "20",
    });
  });

  test("호출 목록에서 빈 필터는 생략한다", () => {
    const params = new URLSearchParams(buildCallsSearch(initial));
    expect(Object.fromEntries(params)).toEqual({
      view: "calls",
      from: "2026-09-08",
      to: "2026-10-07",
      page: "1",
      pageSize: "20",
    });
  });

  test("자료 인용은 기간만 담는다", () => {
    expect(buildCitationsSearch(filtered)).toBe(
      "view=citations&from=2026-10-01&to=2026-10-05",
    );
  });
});
