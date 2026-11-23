import { track } from "@vercel/analytics";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { analyticsBeforeSend, trackEvent } from "./analytics";

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

const trackMock = vi.mocked(track);

beforeEach(() => {
  trackMock.mockReset();
});

describe("trackEvent", () => {
  test("props 없는 허용 이벤트는 이름만 track에 넘긴다", () => {
    trackEvent("diagnosis_complete");
    expect(trackMock).toHaveBeenCalledWith("diagnosis_complete", undefined);
  });

  test("props 있는 허용 이벤트는 props를 그대로 track에 넘긴다", () => {
    trackEvent("signup_complete", { member_type: "parent" });
    trackEvent("service_start", { service: "goal" });
    trackEvent("checkout_start", { method: "card" });
    trackEvent("payment_complete", { method: "easy_pay" });
    trackEvent("consult_apply");
    trackEvent("kakao_inquiry_click", { location: "footer" });
    trackEvent("report_export", { service: "growth", method: "pdf" });
    trackEvent("paywall_cta_click", { service: "inquiry", location: "banner" });
    trackEvent("ai_regenerate", { service: "selfeval", step: "topics" });
    expect(trackMock.mock.calls).toEqual([
      ["signup_complete", { member_type: "parent" }],
      ["service_start", { service: "goal" }],
      ["checkout_start", { method: "card" }],
      ["payment_complete", { method: "easy_pay" }],
      ["consult_apply", undefined],
      ["kakao_inquiry_click", { location: "footer" }],
      ["report_export", { service: "growth", method: "pdf" }],
      ["paywall_cta_click", { service: "inquiry", location: "banner" }],
      ["ai_regenerate", { service: "selfeval", step: "topics" }],
    ]);
  });

  test("모르는 이벤트 이름은 조용히 버린다", () => {
    // @ts-expect-error 런타임 가드 검증을 위해 타입을 우회한다
    trackEvent("unknown_event");
    expect(trackMock).not.toHaveBeenCalled();
  });

  test("props가 3개 이상이면 버린다", () => {
    // @ts-expect-error 런타임 가드 검증을 위해 타입을 우회한다
    trackEvent("report_export", { service: "goal", method: "pdf", extra: "x" });
    expect(trackMock).not.toHaveBeenCalled();
  });

  test("문자열이 아닌 props 값은 버린다", () => {
    // @ts-expect-error 런타임 가드 검증을 위해 타입을 우회한다
    trackEvent("service_start", { service: 1 });
    expect(trackMock).not.toHaveBeenCalled();
  });

  test("track이 throw해도 호출부로 새지 않는다", () => {
    trackMock.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => trackEvent("consult_apply")).not.toThrow();
  });
});

describe("analyticsBeforeSend", () => {
  const pageview = (url: string) =>
    ({ type: "pageview", url }) as Parameters<typeof analyticsBeforeSend>[0];

  test.each([
    "https://winning.test/admin",
    "https://winning.test/admin/users",
    "https://winning.test/teacher",
    "https://winning.test/teacher/classes",
  ])("%s 는 버린다", (url) => {
    expect(analyticsBeforeSend(pageview(url))).toBeNull();
  });

  test.each([
    "https://winning.test/adminx",
    "https://winning.test/app/goal",
    "https://winning.test/",
  ])("%s 는 그대로 둔다", (url) => {
    expect(analyticsBeforeSend(pageview(url))).toEqual(pageview(url));
  });

  test("쿼리스트링과 해시를 지운다", () => {
    expect(
      analyticsBeforeSend(
        pageview("https://winning.test/pay?paymentKey=k&a=b#tok"),
      ),
    ).toEqual(pageview("https://winning.test/pay"));
  });

  test("URL을 해석할 수 없으면 버린다", () => {
    expect(analyticsBeforeSend(pageview("not a url"))).toBeNull();
  });
});
