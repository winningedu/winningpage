import { apiFetch, getAuthHeader } from "./apiFetch";

// 로컬 QA 전용 결제 게이트 우회 플래그.
// 사용법: .env.local에 VITE_DISABLE_PAID_GATE=true 를 추가하고 개발 서버를 재시작한다.
// import.meta.env.DEV를 반드시 함께 검사한다 — 프로덕션 빌드는 항상 DEV=false이므로,
// 이 값이 실수로 환경변수에 들어가도(Vercel 등) 프로덕션 번들에서는 우회가 절대 불가능하다.
// 플래그 단독으로 판정하면 그 안전장치가 사라진다.
const PAID_GATE_DISABLED =
  import.meta.env.DEV === true &&
  import.meta.env.VITE_DISABLE_PAID_GATE === "true";

const PAID_MESSAGE = "유료결제이후 이용해주세요!";
const CURSOR_RESTORE_DELAY_MS = 600;

// 호출부마다 필드 구성이 조금씩 다른 "서비스 카드/CTA 컨텍스트"를 느슨하게 받는다
// (PaymentSuccess.tsx의 ServiceEntry, DynamicPage.tsx의 paidServiceContext 등).
type PaidServiceLike = {
  name?: string | null;
  title?: string | null;
  label?: string | null;
  description?: string | null;
  desc?: string | null;
  link?: string | null;
  to?: string | null;
  slug?: string | null;
};

// 클릭 핸들러에서 넘어오는 이벤트를 duck-typing으로 받는다 — 이 파일은 React 컴포넌트가
// 아니라 여러 프레임워크/호출부(순수 DOM 핸들러 포함)에서 쓰일 수 있어 React.MouseEvent로
// 좁히지 않는다.
type PaidServiceMouseEvent = {
  preventDefault?: () => void;
  stopPropagation?: () => void;
  currentTarget?: EventTarget | null;
  target?: EventTarget | null;
};

type PaidServiceConfig = {
  serviceKey: string;
  serviceName: string;
  match: (service?: PaidServiceLike) => boolean;
};

const PAID_SERVICE_CONFIGS: PaidServiceConfig[] = [
  {
    serviceKey: "suhaeng",
    serviceName: "수행평가 서비스",
    match(service = {}) {
      const text = [
        service.name,
        service.title,
        service.label,
        service.description,
        service.desc,
        service.link,
        service.to,
        service.slug,
      ]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");

      return (
        text.includes("수행") ||
        text.includes("수행평가") ||
        text.includes("assessment") ||
        text.includes("services-ai-performance") ||
        text.includes("services/assessment") ||
        text.includes("services#ai")
      );
    },
  },
  {
    serviceKey: "goal",
    serviceName: "목표관리 서비스",
    match(service = {}) {
      const text = [
        service.name,
        service.title,
        service.label,
        service.description,
        service.desc,
        service.link,
        service.to,
        service.slug,
      ]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");

      return (
        text.includes("목표관리") ||
        text.includes("목표 관리") ||
        text.includes("목표") ||
        text.includes("goal") ||
        text.includes("target-main") ||
        text.includes("target") ||
        text.includes("services#goal")
      );
    },
  },
  {
    serviceKey: "growth",
    serviceName: "성장설계 서비스",
    match(service = {}) {
      const text = [
        service.name,
        service.title,
        service.label,
        service.description,
        service.desc,
        service.link,
        service.to,
        service.slug,
      ]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");

      return text.includes("성장설계") || text.includes("growth");
    },
  },
];

function getPaidServiceConfig(service?: PaidServiceLike) {
  return PAID_SERVICE_CONFIGS.find((config) => config.match(service)) || null;
}

const SERVICE_NOT_READY_MESSAGE = "서비스 예정입니다.";

// 상세 페이지(= PAID_SERVICE_CONFIGS 등록 서비스)가 아직 없는 서비스의 히어로 CTA용 핸들러.
// 자기평가・심화탐구・콜멘토 3종이 여기 해당한다(2026-08-05, 사용자 확정). 서비스가 실제 앱을
// 갖추면 PAID_SERVICE_CONFIGS에 등록하고 이 핸들러를 openPaidServiceOrAlert로 교체한다.
export function alertServiceNotReady(event?: PaidServiceMouseEvent) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  window.alert(SERVICE_NOT_READY_MESSAGE);
}

function setGlobalLoadingCursor(isLoading: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.style.cursor = isLoading ? "progress" : "";
  document.body.style.cursor = isLoading ? "progress" : "";
}

// target은 이벤트의 currentTarget/target(EventTarget) 또는 이미 element일 수도 있는
// 런타임 duck-typed 값이라 any로 둔다(호출부가 다양한 이벤트 소스를 넘긴다).
function setButtonLoading(
  target: any,
  isLoading: boolean,
  label = "이동 중...",
) {
  const el = target?.closest ? target.closest("button, a") : target;
  if (!el || !("style" in el)) return;

  if (isLoading) {
    if (!el.dataset.originalText)
      el.dataset.originalText = el.textContent || "";
    el.dataset.ssoLoading = "true";
    el.style.cursor = "progress";
    el.style.pointerEvents = "none";
    if (el.tagName === "BUTTON") el.disabled = true;
    if (el.textContent?.trim()) el.textContent = label;
  } else {
    el.style.cursor = "";
    el.style.pointerEvents = "";
    if (el.tagName === "BUTTON") el.disabled = false;
    if (el.dataset.originalText) el.textContent = el.dataset.originalText;
    delete el.dataset.ssoLoading;
  }
}

function openNormalLink(link: string | null | undefined) {
  if (!link) return;

  if (/^https?:\/\//i.test(link)) {
    window.location.href = link;
    return;
  }

  window.location.href = link;
}

export async function openPaidServiceOrAlert(
  event: PaidServiceMouseEvent | undefined,
  service: PaidServiceLike | undefined,
): Promise<boolean> {
  const config = getPaidServiceConfig(service);
  const targetEl = event?.currentTarget || event?.target;

  event?.preventDefault?.();
  event?.stopPropagation?.();

  if (!config) {
    openNormalLink(service?.link || service?.to);
    return true;
  }

  if (PAID_GATE_DISABLED) {
    console.info(
      `[paidServiceAccess] 로컬 결제 게이트 우회: ${config.serviceKey} (${config.serviceName})`,
    );
    openNormalLink(service?.link || service?.to);
    return true;
  }

  setGlobalLoadingCursor(true);
  setButtonLoading(targetEl, true, "입장 확인 중...");

  try {
    const authHeader = await getAuthHeader();

    if (!authHeader) {
      window.alert(PAID_MESSAGE);
      return true;
    }

    const response = await apiFetch("/api/create-service-ticket", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
      },
      body: JSON.stringify({ service_key: config.serviceKey }),
    });

    let result: { redirect_url?: string; detail?: string } = {};
    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (!response.ok || !result?.redirect_url) {
      window.alert(result?.detail || PAID_MESSAGE);
      return true;
    }

    setButtonLoading(targetEl, true, "이동 중...");
    window.location.href = result.redirect_url;
    return true;
  } catch (error) {
    console.error("유료 서비스 접근 확인 오류:", error);
    window.alert(PAID_MESSAGE);
    return true;
  } finally {
    // 정상 이동은 페이지가 바뀌므로 보이지 않지만, 실패/차단 시 커서를 복구한다.
    setTimeout(() => {
      setGlobalLoadingCursor(false);
      setButtonLoading(targetEl, false);
    }, CURSOR_RESTORE_DELAY_MS);
  }
}
