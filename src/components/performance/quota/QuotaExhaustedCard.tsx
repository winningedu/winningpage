import InlineCard from "@/components/performance/chat/InlineCard";

// 회차 소진 인라인 카드 (표면 B) — docs/수행평가-상세-명세.md §5.20 / §9.3 / §8.6.
//
// **시안이 없는 화면이다.** 24개 노드 어디에도 회차가 0인 사용자의 표면이 없어(§5.20 단정)
// 치수·문구는 §5.20이 인앱 토큰 위에서 확정한 값을 그대로 따른다.
//
// ── 언제 뜨는가
//   STEP3 `recommend-topics`가 `409 { error:{code:'QUOTA_EXHAUSTED'}, quotaRemaining:0,
//   planEndsAt }`을 돌려줬을 때만이다. **모달이 아니라 타임라인 안**에 `AiLoadingBubble`을
//   대체해 들어가며(§5.20 (B)), 호출부가 AI 컬럼(아바타+라벨) 안에 넣어 정렬을 맞춘다.
//   진입 가드(§2.2)는 회차를 차단 사유로 쓰지 않는다 — 소진 판정은 서버가 이 응답으로만
//   내리고 클라이언트 판정은 안내용이다(§5.20 결정 근거 2).
//
// ── 실측 대응 (§5.20 (B) 표)
//   컨테이너 `InlineCard` 재사용 — 37.25rem(596) r1rem stroke `#d9d9d9`, 좌우 1.875rem(30)·
//   상 1.25rem(20). 하단만 실측 1.5rem(24)이라 `pb-6`을 얹는다(GuideUploadCard와 같은 관례).
//   제목 1rem/1.3125rem w600 `#525252`(=`ink`), 설명 0.875rem/1.125rem w400 `#808080`(=`ink-sub`).
//   CTA 2종 각 15.9375rem×3.25rem(255×52) r0.75rem — primary `#013262`(=`primary`,
//   §11.1 Q5 인앱 primary 토큰), secondary stroke `#d9d9d9`.
//   두 버튼 합(255+20+255=530)이 카드 내부 폭(536)보다 6px 좁은 것도 STEP2 버튼 줄과 같은
//   시안 인셋 불일치다 — 고정폭으로 옮기면 좁은 뷰포트에서 깨지므로 `flex-1`로 나누고
//   사이 간격만 실측대로 1.25rem을 준다(GuideUploadCard와 동일 판단).
//
//   두 버튼 모두 공용 `PrimaryButton`/`OutlineButton`을 쓰지 않는다 — primary는 `<a>`라
//   `<button>` 프리미티브에 담기지 않고, secondary는 보더 색이 `performance-line`(#d9d9d9)
//   이어야 하는데 `OutlineButton`의 `muted` 톤은 전역 `line`(#d7d7d7)이고 이 저장소엔
//   tailwind-merge가 없어 `className`으로 덮으면 승자가 예측 불가다(OutlineButton 상단 주석).
//   대신 치수·톤은 두 프리미티브의 기본값(h-[3.25rem]/rounded-xl)과 정확히 같은 값을 쓴다.
//
// ── 입력 내용은 유실되지 않는다 (§5.20 단정)
//   STEP1~2 입력값은 이미 `performance_sessions` 로우에 저장돼 있고 409와 무관하다.
//   그래서 ⓐ 설명 문구가 그 사실을 명시하고 ⓑ `나중에 하기`는 세션을 건드리지 않고
//   **이 카드만 닫는다**(호출부의 `onDismiss`가 세션 상태를 그대로 둔다). 문구와 동작
//   양쪽에서 같은 약속을 지키는 것이 이 카드의 핵심이다.
//
//   ⓒ **primary CTA도 이 약속을 지켜야 한다** — 그래서 `<Link>`가 아니라 새 탭 `<a>`다.
//   같은 탭에서 라우트를 떠나면 `PerformanceChatPage`의 상태(`createdSession`·`guideMode`·
//   `guideDone`·`manualText`·`uploadedCount`)가 전부 컴포넌트 로컬 `useState`라 언마운트와
//   함께 사라진다. 재방문 분기·프리필은 P13 몫이라 아직 없고 `/app/performance/reports`도
//   아직 플레이스홀더라, 결제 후 돌아온 사용자는 STEP1 인사말부터 다시 만나고 폼을 다시
//   내면 `session.js`가 `409 UNCHARGED_SESSION_EXISTS`로 막는다 — 그런데 그 응답이 안내하는
//   저장 리포트 화면이 없어서 어디로도 갈 수 없다. DB 로우는 살아 있어도 사용자 관점의
//   "유실 없음"이 성립하지 않는다.
//   새 탭으로 열면 채팅 탭의 상태가 그대로 살아 있고, 결제 후 돌아와 `나중에 하기` →
//   `주제 추천 다시 시도`(호출부)만 누르면 입력값 그대로 이어진다. **P13 재개 화면이
//   들어오면 같은 탭 이동으로 되돌려도 된다** — 그때까지의 임시 조치다.
//
// ── 소진 상태에서도 막히지 않는 것 (§5.20 결정 표 / Q54 정정)
//   저장 리포트 열람, 진행 중(=이미 차감된) 세션 이어서 하기, 그 세션 안의 주제 재추천은
//   전부 허용이다. 소진이 막는 것은 **새 세션 시작**뿐이다. 그래서 이 카드는 "다시 시도"를
//   권하지 않고 이용권 추가 경로만 제시한다.

const TITLE = "이용 가능한 횟수를 모두 사용했어요.";

// §5.20 확정본. 손대지 말 것 — "지금까지 입력한 내용은 저장돼 있으니"가 위 단정과 한 쌍이다.
const DESCRIPTION =
  "추천을 시작하려 했지만 남은 횟수가 없습니다. 지금까지 입력한 내용은 저장돼 있으니, 이용권을 추가하면 이어서 진행할 수 있어요.";

const PURCHASE_LABEL = "이용권 구매하기";
const LATER_LABEL = "나중에 하기";

/** §5.20 CTA 목적지. 이용요금 페이지다. */
const PURCHASE_TO = "/pricing";

/** 새 창 이동을 라벨에도 알린다(시각적 표시가 없는 링크라 접근성 이름으로만 전달된다). */
const PURCHASE_ARIA_LABEL = `${PURCHASE_LABEL} (새 창)`;

/**
 * `planEndsAt`(ISO)을 `2026. 8. 11.` 형태로. 파싱할 수 없으면 아무것도 렌더하지 않는다 —
 * 날짜 자리에 원문 문자열을 그대로 흘리면 사용자에게 의미 없는 값이 보인다.
 */
function formatPlanEndsAt(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * @param {string|null} [planEndsAt] 409 응답이 함께 준 이용권 만료일(ISO). **제안** — §5.20
 *   표에는 이 줄이 없지만 계약이 값을 내려보내는 이상 화면에서 쓰이지 않으면 사용자는
 *   "이용권이 끝난 것"과 "회차만 소진된 것"을 구분할 수 없다. 값이 없으면 줄 자체를 뺀다.
 * @param {() => void} [onDismiss] `나중에 하기`. 카드만 닫고 STEP1~2 입력 상태는 그대로 둔다.
 */
type QuotaExhaustedCardProps = {
  planEndsAt?: string | null;
  onDismiss?: () => void;
};

export default function QuotaExhaustedCard({
  planEndsAt = null,
  onDismiss,
}: QuotaExhaustedCardProps) {
  const endsAtText = formatPlanEndsAt(planEndsAt);

  return (
    <InlineCard className="pb-6">
      {/* 시안 없는 표면이라 내부 리듬은 §5.20 표의 항목 순서를 그대로 세로 스택으로 편다.
          제목↔설명 0.5rem, 설명↔버튼 줄 1.25rem — STEP2 카드(§5.6)와 같은 리듬이다. */}
      <div className="flex flex-col gap-2">
        <p className="text-app-card-title font-semibold text-ink">{TITLE}</p>
        <p className="text-app-label font-normal text-ink-sub">{DESCRIPTION}</p>
        {endsAtText && (
          <p className="text-app-label font-normal text-ink-sub">
            현재 이용권은 {endsAtText}까지 유효해요.
          </p>
        )}
      </div>

      <div className="mt-5 flex items-center gap-5">
        {/* 새 탭으로 연다 — 이유는 파일 상단 ⓒ. `<Link>`가 아니라 `<a>`인 것은
            react-router가 `target="_blank"`에서 어차피 브라우저 기본 이동으로 넘기기 때문에
            라우터를 경유할 이유가 없어서다. */}
        <a
          href={PURCHASE_TO}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={PURCHASE_ARIA_LABEL}
          className="flex h-13 flex-1 items-center justify-center rounded-xl bg-primary text-base font-semibold text-white transition hover:bg-primary/90 active:scale-[0.97] motion-reduce:active:scale-100"
        >
          {PURCHASE_LABEL}
        </a>
        <button
          type="button"
          onClick={onDismiss}
          className="flex h-13 flex-1 items-center justify-center rounded-xl border border-performance-line bg-white text-base font-medium text-ink transition hover:border-ink-sub active:scale-[0.97] motion-reduce:active:scale-100"
        >
          {LATER_LABEL}
        </button>
      </div>
    </InlineCard>
  );
}
