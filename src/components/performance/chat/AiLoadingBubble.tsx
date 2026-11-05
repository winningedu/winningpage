import type { HTMLAttributes } from "react";
import { forwardRef } from "react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
} from "@/components/ui/message";
import { siteWording } from "@/config/wording";
import AiAvatar from "./AiAvatar";

type AiLoadingBubbleProps = HTMLAttributes<HTMLDivElement> & {
  /** 로딩 제목. 문구는 `loadingCopy.ts` 3쌍 중 호출부가 골라 넘긴다. */
  title?: string;
  /** 로딩 보조문. */
  subtitle?: string;
  /** 발신자 라벨. `AiMessage`와 동일 기본값. */
  label?: string;
};

// AI 로딩 카드 프리미티브 — docs/수행평가-상세-명세.md §5.3(정본 제안: "아이콘 1.5rem +
// 제목/보조 2줄") / §5.9(`3754:3493`) / §5.12(`3754:3868`) / §5.15(`3754:4248`) 3개 노드
// 실측 — 세 노드 모두 같은 카드를 쓴다(치수·인셋·타이포 전부 동일, 문구만 다르다).
//
// **2026-09-06 재구성**: `AiMessage`와 같은 `Message`(아바타·헤더) 골격을 쓰고, 말풍선
// 안쪽의 "아이콘 + 제목/보조 2줄" 상태 표시는 shadcn `Marker`(`MarkerIcon`+`MarkerContent`,
// 원래 "아이콘 하나 + 상태 텍스트" 조합을 위한 프리미티브라 이 카드의 구조와 그대로
// 맞는다)로 옮긴다. `loadingCopy.ts`가 주는 `{title, subtitle}` 두 줄 구조는 그대로
// `MarkerContent` 안에 두 개 `span`으로 유지한다.
//
// **2026-09-06 shadcn 공식 조합 정렬**: `Bubble`을 `AiMessage`와 같은 이유로
// `variant="ghost"` + 수동 배경/패딩/반경에서 `variant="secondary"` + 기본 배경/패딩/반경
// (`BubbleContent`의 `bg-secondary`/`rounded-xl`/`px-3 py-2`)으로 바꿨다. `--secondary`는
// 예전 `--color-performance-bubble`(`#f8f7f5`)과 밝기가 거의 같은 중립 연회색이라(§7.1
// 표와 정확히 같은 값은 아님, `AiMessage` 주석 참고) 아래 WCAG AA 대비 판단은 그대로
// 유효하다고 본다(재측정하지 않음, 육안 확인 필요 시 보고).
//
// 실측 (3개 노드 공통, 2026-09-06 스케일 축소 이전값):
//   말풍선 596×83, r16, `fill #f8f7f5`(=`performance-bubble`, 지금은 `--secondary`로 이관).
//   아이콘 프레임 24×24, 말풍선 좌변에서 18px 인셋 — 다른 카드의 표준 패딩(20px)과 다른
//   값이라 그대로 실측대로 뒀었으나, 이번 스케일 축소로 좌 인셋도 한 단계 줄여 `p-4`
//   계열로 통일한다(아래 `BubbleContent` 패딩 참고). 아이콘↔텍스트 gap도 비례 축소.
//   제목 15px/22.5 w600 `ink`, 보조문 13px/18 w500 `ink-sub`(2026-09-06 스케일 축소 —
//   기존 16px/14px). 과거 `ink-sub`(#808080) on `performance-bubble`(#f8f7f5)은 WCAG AA
//   미달이라 `ink`로 우회했으나, `ink-sub` 토큰이 #6b6b6b로 상향되며 AA를 충족해
//   우회를 걷어냈다(그대로 유지).
//   제목↔보조문 gap 4px(0.25rem, 유지).
//   벡터 아이콘 자체는 Figma에서 19×19 `fill #1f1f1f` 단색 도형으로만 추출되고 패스 데이터가
//   없다 — 실제 글리프(어떤 모양인지)는 시안에서 판별 불가. **자체 판단으로 "생성 중"을
//   뜻하는 스파클(반짝임) 아이콘을 새로 그렸다** — 색은 실측값 `#1f1f1f`를 그대로 쓴다
//   (§7.1 표에 없는 가장 가까운 신규 1회성 값이라 토큰화하지 않았다).
//
// **로딩 애니메이션 (작업 지시서 ③)** 시안은 정적이지만 실제 로딩 상태를 표현해야 한다.
// 스파클은 대칭이 아니라 `animate-spin`으로 돌리면 방향성 없는 도형이 빙글빙글 도는
// 어색한 인상을 준다 — 대신 `animate-pulse`(불투명도 반복)로 "은은하게 반짝이는" 느낌을
// 주는 쪽을 선택했다. `motion-reduce:animate-none`으로 OS 모션 축소 설정을 존중한다.
//
// 접근성: 별도 `role="status"`를 걸지 않는다(그리핑 원인 — 2026-09-06 결정 당시엔
// "보강"으로 판단했으나 실제로는 이중 배선이었다). 이 카드는 `ChatTimeline`의
// `MessageScrollerContent`(`role="log" aria-relevant="additions"`, ARIA `log` 롤이
// 암묵적으로 `aria-live="polite"`를 내포한다) 서브트리 안에서 렌더된다 — 카드 자신에
// `role="status"`(자체 live region)를 또 걸면 새 로딩 카드가 나타났을 때 상위 `log`
// 리전과 이 `status` 리전 둘 다 같은 텍스트를 announce해 스크린 리더가 두 번 읽는다.
// **`ref`는 루트(아바타+컬럼 행)에 전달된다.** `PerformanceChatPage`가 STEP4 설계 리포트
// 로딩 진입 시 이 카드로 포커스를 직접 옮기는 데 쓴다(검토 A-2 — 확정 경로는 카드 목록이
// 통째로 언마운트돼 Base UI Dialog가 하는 것과 같은 "트리거로 포커스 복귀"가 도달 불가하다
// — 트리거 자체가 문서에서 떨어져 나가서다. 그래서 호출부가 새 포커스 목적지를 직접
// 지정해야 한다). `ChatTimeline`이 메시지에 `focusRef`가 있으면 여기로 전달하고
// `tabIndex={-1}`도 함께 준다(포커스 트랩 대상은 아니고 프로그램적 포커스 전용).
const AiLoadingBubble = forwardRef<HTMLDivElement, AiLoadingBubbleProps>(
  function AiLoadingBubble(
    {
      title,
      subtitle,
      label = siteWording("위닝 수행평가 서포터"),
      className = "",
      ...rest
    },
    ref,
  ) {
    return (
      <Message
        ref={ref}
        align="start"
        className={["items-start gap-5", className].join(" ")}
        {...rest}
      >
        <MessageAvatar className="size-10 self-start overflow-visible rounded-xl bg-transparent">
          <AiAvatar />
        </MessageAvatar>
        <MessageContent className="min-w-0 flex-1 items-start gap-4">
          <MessageHeader className="px-0 text-app-label font-semibold text-ink">
            {label}
          </MessageHeader>
          <Bubble
            variant="secondary"
            align="start"
            className="w-full max-w-perf-bubble"
          >
            <BubbleContent className="w-full">
              <Marker className="min-h-0 w-full gap-4 text-ink">
                <MarkerIcon
                  aria-hidden="true"
                  className="flex size-6 shrink-0 animate-pulse items-center justify-center motion-reduce:animate-none"
                >
                  <LoadingSparkle />
                </MarkerIcon>
                <MarkerContent className="flex min-w-0 flex-col gap-1">
                  <span className="text-app-body font-semibold text-ink">
                    {title}
                  </span>
                  <span className="text-app-label font-medium text-ink-sub">
                    {subtitle}
                  </span>
                </MarkerContent>
              </Marker>
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    );
  },
);

export default AiLoadingBubble;

function LoadingSparkle() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4.75 w-4.75 text-[#1f1f1f]"
    >
      <path
        d="M12 2c.5 4.2 1.5 6.9 3 8.4 1.5 1.5 4.2 2.5 8.4 3-4.2.5-6.9 1.5-8.4 3-1.5 1.5-2.5 4.2-3 8.4-.5-4.2-1.5-6.9-3-8.4-1.5-1.5-4.2-2.5-8.4-3 4.2-.5 6.9-1.5 8.4-3 1.5-1.5 2.5-4.2 3-8.4Z"
        fill="currentColor"
      />
    </svg>
  );
}
