/**
 * SurveyProgress
 * Figma: hsokTD6OilcNEXyCR24sn4 / 1889:8975 (잔여 문항 배너, bg #D7D7D7)
 *
 * 사용자 확정 사양(2026-08-03): 미완료/완료 둘 다 **클릭 가능한 버튼**이다.
 * - 미완료: "모든 항목에 응답해주세요" — 클릭하면 다음 스텝으로 넘어가지 않고
 *   첫 미응답 문항으로 스크롤 + 하이라이트한다(호출부 책임, `useUnansweredNavigation` 참고).
 * - 완료: "N개 항목이 남았어요"(마지막 스텝은 "진단 결과 보기") — 클릭하면 다음으로 이동.
 *
 * 시각은 상태로만 바뀐다 — 크기/폭/타이포는 기존 시안 실측(1112×60, radius 12) 그대로:
 *   폭 1112(컨테이너 폭 기준) × 60 (3.75rem), radius 12 (0.75rem),
 *   padding 16·75 (1rem·4.6875rem), 라벨 20px SemiBold.
 * 미완료 = bg #D7D7D7(흰 글자 대비를 위해 텍스트는 그대로 흰색) / 완료 = bg #013262.
 */
type SurveyProgressProps = {
  complete?: boolean;
  label?: string;
  onClick?: () => void;
  /** a request is running: the button is disabled and marked aria-busy */
  busy?: boolean;
};

export default function SurveyProgress({
  complete,
  label,
  onClick,
  busy = false,
}: SurveyProgressProps) {
  const bannerClass =
    "flex h-perf-inset w-full items-center justify-center rounded-xl px-6 py-4 text-center text-xl font-semibold leading-5 text-white transition-colors duration-150 sm:px-18.75 focus:outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  const stateClass = complete
    ? "bg-primary hover:bg-[#01274D] active:scale-[0.99] active:bg-[#001C38]"
    : "bg-line hover:bg-[#C4C4C4] active:bg-[#B8B8B8]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      className={`${bannerClass} ${stateClass} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {label}
    </button>
  );
}
