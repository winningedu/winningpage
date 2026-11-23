import { track } from "@vercel/analytics";

export type AnalyticsService =
  | "diagnosis"
  | "goal"
  | "growth"
  | "performance"
  | "selfeval"
  | "inquiry";

// 이벤트 이름별 props 타입. props가 없는 이벤트는 undefined.
// props는 최대 2개, 값은 고정 유니온 문자열만 허용한다(자유 텍스트와 개인정보 금지).
export type AnalyticsEventMap = {
  signup_complete: {
    member_type: "student" | "under14" | "parent" | "school_student";
  };
  service_start: { service: AnalyticsService };
  diagnosis_complete: undefined;
  checkout_start: { method: "card" | "virtual_account" };
  payment_complete: { method: "card" | "easy_pay" | "transfer" | "other" };
  consult_apply: undefined;
  kakao_inquiry_click: {
    location:
      | "footer"
      | "online_inquiry"
      | "mypage"
      | "payment"
      | "premium"
      | "signup_notice";
  };
  report_export: {
    service: AnalyticsService;
    method: "pdf" | "print" | "copy";
  };
  paywall_cta_click: {
    service: AnalyticsService;
    location: "chat_card" | "banner" | "start_page" | "survey" | "reports";
  };
  ai_regenerate: { service: AnalyticsService; step: "topics" | "result" };
};

export type AnalyticsEventName = keyof AnalyticsEventMap;

type TrackArgs<N extends AnalyticsEventName> =
  AnalyticsEventMap[N] extends undefined ? [] : [props: AnalyticsEventMap[N]];

export function trackEvent<N extends AnalyticsEventName>(
  name: N,
  ...args: TrackArgs<N>
): void {
  track(name, args[0]);
}
