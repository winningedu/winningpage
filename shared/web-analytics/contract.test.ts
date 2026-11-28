import { describe, expect, test } from "vitest";
import { webAnalyticsReportSchema } from "./contract.js";
import { WEB_ANALYTICS_EVENTS } from "./events.js";

const report = (events: unknown[]) => ({
  range: { from: "2026-11-01", to: "2026-11-07" },
  totals: { pageviews: 10, visitors: 4 },
  topPages: [],
  events,
});

const event = (name: string, property: string) => ({
  name,
  count: 1,
  visitors: 1,
  breakdowns: [{ property, values: [{ value: "x", count: 1 }] }],
});

describe("WEB_ANALYTICS_EVENTS", () => {
  test("이벤트마다 속성은 2개 이하이고 이름은 겹치지 않는다", () => {
    const names = WEB_ANALYTICS_EVENTS.map((e) => e.name);

    expect(new Set(names).size).toBe(names.length);
    for (const e of WEB_ANALYTICS_EVENTS) {
      expect(e.properties.length).toBeLessThanOrEqual(2);
    }
  });
});

describe("webAnalyticsReportSchema 이벤트", () => {
  test("목록에 있는 이벤트 이름과 속성은 받는다", () => {
    const body = report([event("signup_complete", "member_type")]);

    expect(webAnalyticsReportSchema.parse(body)).toEqual(body);
  });

  test("목록에 없는 이벤트 이름은 거른다", () => {
    expect(
      webAnalyticsReportSchema.safeParse(
        report([event("not_an_event", "member_type")]),
      ).success,
    ).toBe(false);
  });

  test("목록에 없는 속성 이름은 거른다", () => {
    expect(
      webAnalyticsReportSchema.safeParse(
        report([event("signup_complete", "not_a_property")]),
      ).success,
    ).toBe(false);
  });
});
