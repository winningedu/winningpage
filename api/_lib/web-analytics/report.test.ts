// 방문 분석 서버가 읽는 이벤트 이름과 속성(WEB_ANALYTICS_EVENTS)이 수집 쪽 계약과 같은지 잠근다.
// 지금 계약은 ANALYTICS_EVENT_CONTRACT(이 브랜치가 src/lib/analytics.ts 의 AnalyticsEventMap 을 옮겨 적은 값)다.
// hqa-vercel 이 통합되면 메인 세션이 비교 대상을 src/lib/analytics.ts 로 바꾼다.

import { describe, expect, test } from "vitest";
import { ANALYTICS_EVENT_CONTRACT, WEB_ANALYTICS_EVENTS } from "./report.js";

describe("WEB_ANALYTICS_EVENTS 계약", () => {
  test("이벤트 이름과 순서가 계약과 같다", () => {
    expect(WEB_ANALYTICS_EVENTS.map((e) => e.name)).toEqual(
      Object.keys(ANALYTICS_EVENT_CONTRACT),
    );
  });

  test("이벤트마다 속성 키가 계약과 같고 2개 이하다", () => {
    for (const event of WEB_ANALYTICS_EVENTS) {
      expect([...event.properties]).toEqual([
        ...ANALYTICS_EVENT_CONTRACT[event.name],
      ]);
      expect(event.properties.length).toBeLessThanOrEqual(2);
    }
  });
});
