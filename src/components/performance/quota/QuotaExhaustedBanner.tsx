import { Link } from "react-router";

// 회차 소진 안내 (표면 A) — 셸 상단 배너. docs/수행평가-상세-명세.md §5.20 (A) / §11.1 Q47.
//
// **시안이 없는 화면이다.** §5.20 표가 "제안"으로 남긴 치수·톤을 그대로 따른다: 폭은
// 캔버스 콘텐츠 기준선(384/24rem)부터 전체, 높이 3rem 내외, 배경은 `#fff3d1`
// (`bg-performance-tag` — 주제 카드 메타 태그와 같은 토큰, tailwind.config.js 주석
// "§5.20 회차 소진 배너도 같은 값" 참고. Q80 미확정이지만 이 저장소에 이미 있는
// 경고 톤 중 명세가 제시한 값과 정확히 일치하는 유일한 토큰이라 재사용한다).
//
// ── 언제 뜨는가
//   `PerformanceChatPage`가 `quotaRemaining === 0`이면서 진행 중(이어할 수 있는) 세션이
//   없을 때만 `PerformanceShellContext.setQuotaBannerVisible(true)`를 호출한다. 이 컴포넌트
//   자신은 조건을 모른다 — 렌더 여부는 전적으로 호출부(PerformanceAppLayout)의 몫이다.
//   §5.20 결정 근거: 진입은 막지 않되(저장 리포트 열람·진행 중 세션 이어가기는 허용),
//   STEP1~2를 다 채운 뒤 STEP3에서야 409로 실패하는 낭패를 이 배너가 선제 예방한다.
//
// ── (B) 인라인 소진 카드(QuotaExhaustedCard)와의 차이
//   (B)는 STEP3 409 응답이 실제로 왔을 때 타임라인 안에 뜬다(이미 세션이 있고 그 세션이
//   막힌 경우). (A)는 그보다 이전 — 새 세션을 아직 시작하지 않은 사용자에게 미리 알린다.
//   그래서 이 배너에는 "나중에 하기"(카드만 닫기)가 없다 — 닫아도 다시 새 세션을 시작하려
//   하면 여전히 막히므로 닫기 버튼 자체가 명세에 없다(§5.20 표에 dismiss 항목 없음).
//
// ── CTA
//   `QuotaExhaustedCard`는 새 탭 `<a>`를 쓰지만(채팅 진행 상태 보존 이유, 그 파일 상단
//   주석 ⓒ 참고) 이 배너는 아직 STEP1도 시작하지 않은 시점에서만 뜨므로 보존할 진행
//   상태가 없다 — 그래서 평범한 `<Link>`로 같은 탭 이동한다.

const MESSAGE =
  "이용 가능한 횟수를 모두 사용했어요. 이용권을 추가하면 새 수행평가를 시작할 수 있습니다.";
const CTA_LABEL = "이용권 구매하기";

/** §5.20 CTA 목적지. 이용요금 페이지다. QuotaExhaustedCard와 동일. */
const PURCHASE_TO = "/pricing";

export default function QuotaExhaustedBanner() {
  return (
    <div
      role="status"
      className="mb-6 flex min-h-12 w-full flex-wrap items-center justify-between gap-3 rounded-xl bg-performance-tag px-6 py-3"
    >
      <p className="text-app-body font-medium leading-5.5 text-ink">
        {MESSAGE}
      </p>
      <Link
        to={PURCHASE_TO}
        className="shrink-0 rounded-lg bg-primary px-4 py-2 text-app-label font-semibold leading-4.5 text-white transition hover:bg-primary/90 active:scale-[0.97] motion-reduce:active:scale-100"
      >
        {CTA_LABEL}
      </Link>
    </div>
  );
}
