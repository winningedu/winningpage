import { describe, expect, test } from "vitest";
import {
  type AiTelemetryQuery,
  aiTelemetryQueryReducer,
  buildCallsSearch,
  buildCitationsSearch,
  buildSummarySearch,
  createInitialQuery,
  defaultRange,
} from "./aiTelemetryQuery";

const NOW = new Date("2026-10-06T16:00:00Z");

describe("defaultRange", () => {
  test("오늘(KST)과 29일 전을 날짜 문자열로 돌려준다", () => {
    // UTC 2026-10-06 16:00 은 KST 로 2026-10-07 01:00 이다.
    expect(defaultRange(NOW)).toEqual({ from: "2026-09-08", to: "2026-10-07" });
  });
});

describe("aiTelemetryQueryReducer", () => {
  const initial = createInitialQuery(NOW);

  test("초기 상태는 요약 탭, 기본 기간, 빈 필터, 1페이지다", () => {
    expect(initial.tab).toBe("summary");
    expect(initial.applied).toMatchObject({
      from: "2026-09-08",
      to: "2026-10-07",
      service: "",
      feature: "",
      status: "",
      retriedOnly: false,
      kind: "",
    });
    expect(initial.page).toBe(1);
    expect(initial.pageSize).toBe(20);
  });

  test("입력 중인 필터는 조회를 누르기 전까지 적용되지 않는다", () => {
    const typed = aiTelemetryQueryReducer(initial, {
      type: "setService",
      service: "growth",
    });
    expect(typed.draft.service).toBe("growth");
    expect(typed.applied.service).toBe("");
  });

  test("조회를 누르면 입력값이 적용되고 1페이지로 돌아간다", () => {
    let state: AiTelemetryQuery = { ...initial, page: 4 };
    state = aiTelemetryQueryReducer(state, {
      type: "setRange",
      from: "2026-10-01",
      to: "2026-10-05",
    });
    state = aiTelemetryQueryReducer(state, {
      type: "setFeature",
      feature: "x",
    });
    state = aiTelemetryQueryReducer(state, {
      type: "setStatus",
      status: "error",
    });
    state = aiTelemetryQueryReducer(state, {
      type: "setRetriedOnly",
      retriedOnly: true,
    });
    state = aiTelemetryQueryReducer(state, { type: "setKind", kind: "embed" });
    state = aiTelemetryQueryReducer(state, { type: "submit" });
    expect(state.applied).toEqual({
      from: "2026-10-01",
      to: "2026-10-05",
      service: "",
      feature: "x",
      status: "error",
      retriedOnly: true,
      kind: "embed",
    });
    expect(state.page).toBe(1);
  });

  test("탭을 바꿔도 적용된 필터와 페이지는 유지된다", () => {
    const state = aiTelemetryQueryReducer(
      { ...initial, page: 3 },
      { type: "setTab", tab: "calls" },
    );
    expect(state.tab).toBe("calls");
    expect(state.page).toBe(3);
    expect(state.applied).toEqual(initial.applied);
  });

  test("페이지는 1 미만으로 내려가지 않는다", () => {
    const state = aiTelemetryQueryReducer(initial, {
      type: "setPage",
      page: -2,
    });
    expect(state.page).toBe(1);
  });
});

describe("search 빌더", () => {
  const initial = createInitialQuery(NOW);
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
