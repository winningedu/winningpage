// 방문 분석이 읽는 이벤트 이름과 속성(shared/web-analytics/events.ts 의 WEB_ANALYTICS_EVENTS)이 수집 쪽 src/lib/analytics.ts 의 AnalyticsEventMap 과 같은지 잠근다.
// 이름은 trackEvent 의 런타임 허용 목록으로, 속성 키는 AnalyticsEventMap 타입으로 비교한다
// (속성 키는 타입에만 있다. expectTypeOf 는 CI 의 tsc --noEmit -p api/tsconfig.json 이 검사한다).

import { beforeEach, describe, expect, expectTypeOf, test, vi } from "vitest";

const track = vi.hoisted(() => vi.fn());
vi.mock("@vercel/analytics", () => ({ track }));

import { WEB_ANALYTICS_EVENTS } from "../../../shared/web-analytics/events.js";
import {
  type AnalyticsEventMap,
  trackEvent,
} from "../../../src/lib/analytics.js";

type CollectedProperties = {
  [K in keyof AnalyticsEventMap]: AnalyticsEventMap[K] extends undefined
    ? never
    : keyof AnalyticsEventMap[K];
};

type ServedProperties = {
  [E in (typeof WEB_ANALYTICS_EVENTS)[number] as E["name"]]: E["properties"][number];
};

const sendAny = trackEvent as (
  name: string,
  props?: Record<string, string>,
) => void;

beforeEach(() => {
  track.mockReset();
});

describe("WEB_ANALYTICS_EVENTS 와 src/lib/analytics.ts", () => {
  test("이벤트 이름과 이벤트별 속성 키가 AnalyticsEventMap 과 같다(타입)", () => {
    expectTypeOf<ServedProperties>().toEqualTypeOf<CollectedProperties>();
  });

  test("서버가 읽는 이벤트는 모두 trackEvent 허용 목록에 있어 실제로 보내진다", () => {
    for (const event of WEB_ANALYTICS_EVENTS) {
      const props =
        event.properties.length === 0
          ? undefined
          : Object.fromEntries(event.properties.map((key) => [key, "x"]));
      sendAny(event.name, props);
    }

    expect(track.mock.calls.map((call) => call[0])).toEqual(
      WEB_ANALYTICS_EVENTS.map((e) => e.name),
    );
  });

  test("허용 목록에 없는 이름은 보내지 않는다(비교가 헛돌지 않는지 확인)", () => {
    sendAny("not_an_event");

    expect(track).not.toHaveBeenCalled();
  });

  test("이벤트마다 속성은 2개 이하다", () => {
    for (const event of WEB_ANALYTICS_EVENTS) {
      expect(event.properties.length).toBeLessThanOrEqual(2);
    }
  });
});
