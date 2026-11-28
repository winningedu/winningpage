import { type BeforeSendEvent, track } from "@vercel/analytics";
import { WEB_ANALYTICS_EVENTS } from "../../shared/web-analytics/events.js";

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
    location:
      | "chat_card"
      | "banner"
      | "start_page"
      | "survey"
      | "reports"
      | "usage_exhausted"
      | "finalize"
      | "no_entitlement";
  };
  ai_regenerate: { service: AnalyticsService; step: "topics" | "result" };
};

export type AnalyticsEventName = keyof AnalyticsEventMap;

const ALLOWED_EVENTS: ReadonlySet<string> = new Set(
  WEB_ANALYTICS_EVENTS.map((event) => event.name),
);

type TrackArgs<N extends AnalyticsEventName> =
  AnalyticsEventMap[N] extends undefined ? [] : [props: AnalyticsEventMap[N]];

export function trackEvent<N extends AnalyticsEventName>(
  name: N,
  ...args: TrackArgs<N>
): void {
  // 타입은 우회될 수 있어 런타임에서도 허용 목록, props 2개 이하, 문자열 값만 통과시킨다.
  if (!ALLOWED_EVENTS.has(name)) return;
  const props = args[0] as Record<string, unknown> | undefined;
  if (props) {
    const values = Object.values(props);
    if (values.length > 2 || values.some((v) => typeof v !== "string")) return;
  }
  // 분석이 사용자 동작을 막거나 throw로 번지면 안 된다.
  try {
    track(name, props as Record<string, string> | undefined);
  } catch {
    // 삼킨다
  }
}

const EXCLUDED_PATH = /^\/(admin|teacher)(\/|$)/;

// 관리자와 선생님 화면은 집계에서 뺀다. 쿼리스트링과 해시에는 토큰과 식별자가 실릴 수 있어
// (비밀번호 재설정, 결제 완료, 로그인 redirect, Supabase 인증 해시) origin과 pathname만 남긴다.
export function analyticsBeforeSend(
  event: BeforeSendEvent,
): BeforeSendEvent | null {
  let url: URL;
  try {
    url = new URL(event.url);
  } catch {
    return null;
  }
  if (EXCLUDED_PATH.test(url.pathname)) return null;
  return { ...event, url: url.origin + url.pathname };
}
