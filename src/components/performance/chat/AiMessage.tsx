import type { ReactNode } from "react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
} from "@/components/ui/message";
import { siteWording } from "@/config/wording";
import AiAvatar from "./AiAvatar";

type AiMessageProps = {
  /** 발신자 라벨. 전 노드 공통 `위닝 수행평가 서포터`. */
  label?: string;
  /** 말풍선 본문. 생략하면 말풍선 자체를 렌더하지 않는다. */
  body?: string;
  /** 말풍선 뒤에 이어 붙는 인라인 카드. */
  children?: ReactNode;
  /** 말풍선 max-width 클래스. 기본 `max-w-perf-bubble`(560px, 2026-09-06 스케일 축소). */
  bubbleMaxWidthClassName?: string;
  /** 루트(아바타+컬럼 행)에 추가할 클래스. */
  className?: string;
};

// AI 말풍선 프리미티브 — docs/수행평가-상세-명세.md §3.1(셸 관례) / §5.3(예외) / §5.5·§5.6·§5.8
// (말풍선 뒤에 폼·업로드 카드가 붙는 실제 배치) / §7.1(색) / §7.2(타이포).
//
// **2026-09-06 재구성**: shadcn `Message`(아바타·헤더·컨텐츠 슬롯) + `Bubble`/`BubbleContent`로
// 조립한다. `Message`/`MessageAvatar`/`MessageContent`/`MessageHeader`의 기본 간격
// (`gap-2`/`gap-2.5`)·정렬(`self-end`)은 이 화면 실측(아바타 상단 정렬, 라벨↔말풍선
// `gap-4`)에 맞게 개별 오버라이드한다 — 아래 각 className 주석 참고.
//
// **2026-09-06 재정렬(공식 조합)**: 이전엔 `Bubble variant="ghost"`(프레임 없음 모드)를 두고
// `BubbleContent`에 회색 배경·패딩·반경을 다시 얹었다 — ghost의 "프레임을 강제하지 않는다"는
// 의미와 정면으로 모순됐다. `Bubble`은 shadcn 팔레트 중 중립 회색을 뜻하는
// `variant="secondary"`로 바꾸고, 배경·패딩·반경 오버라이드는 전부 제거해 `BubbleContent`
// 기본값(`bg-secondary`/`rounded-xl`/`px-3 py-2`)을 그대로 쓴다. `--secondary`
// (`oklch(0.97 0 0)`, 이미 버튼 등 사이트 전역에서 쓰는 토큰)는 예전 전용 토큰
// `--color-performance-bubble`(`#f8f7f5`)과 거의 같은 밝기의 중립 연회색이라 육안상 체감
// 차이는 미미하다(정확히 같은 값은 아니라 보고 대상). `--color-performance-bubble` 토큰
// 자체는 `bg-performance-bubble`로 수행평가 화면 전역(폼 입력창·카드·보조 버튼 hover 등
// 채팅 밖 수십 곳)에서 계속 쓰이므로 값·정의는 그대로 둔다 — 채팅 말풍선 두 곳만 그
// 전역 표면색 대신 shadcn 테마 토큰으로 갈아탄 것이다. 말풍선 폭(`max-w-perf-bubble` 등)은
// `BubbleContent`가 아니라 `Bubble`에 한 번만 건다 — `bubbleVariants`의 기본
// `max-w-[80%]`(`secondary` 등 비-ghost variant에 적용)를 이 화면 실측 폭으로 교체하는
// 것이므로 `Bubble` 레벨이 맞는 자리다.
//
// 좌표 실측(공통, `3754:3261`/`3754:3370` 등 596폭 노드 기준, 2026-09-06 스케일 축소 이전값):
//   아바타 @384,y 52×52 → 우변 436. 라벨·말풍선 @456,y → 아바타와 컬럼 사이 gap 20px(1.25rem).
//   라벨 @456,270 h18 → 말풍선 @456,304 : gap 16px(1rem) → 이번 스케일 축소로 `gap-4`(1rem)
//   유지. 말풍선(`3754:3206`) → 폼 카드(`3754:3206` @456,447): gap 16px(1rem)로 동일 — 그래서
//   컬럼 전체에 `gap-4`(1rem) 하나만 주면 라벨↔말풍선, 말풍선↔후속 카드 두 간격이 동시에 맞는다.
//
// **말풍선 폭 예외 (§5.3 단정)** `3754:3035`(접속 직후 로딩) 한 노드만 말풍선 폭이 다른
// 노드보다 좁고, 나머지 전 노드는 `perf-bubble` 토큰이다. 명세는 기본값을 정본으로 제안하면서도
// 예외를 규정으로 남겼으므로, 기본값은 `perf-bubble`로 두고 `bubbleMaxWidthClassName`으로
// 완전히 교체할 수 있게 열어 둔다 — 이 prop은 항상 기본값을 **대체**하지, 덧붙이지 않는다.
//
// 조립은 이 컴포넌트가 하지 않는다 — `body`는 이 말풍선 텍스트만 렌더하고, 후속 인라인
// 카드(폼·업로드 슬롯·리포트 요약)는 `children`으로 받아 같은 컬럼 안, 말풍선 바로 아래에
// 놓는다. 카드 자체의 마크업·상태는 `ChatTimeline`과 그 하위 `InlineCard`가 책임진다.
export default function AiMessage({
  label = siteWording("위닝 수행평가 서포터"),
  body,
  children,
  bubbleMaxWidthClassName = "max-w-perf-bubble",
  className = "",
}: AiMessageProps) {
  return (
    <Message
      align="start"
      className={["items-start gap-5", className].join(" ")}
    >
      {/* 2026-09-06 확인: 공식 `MessageAvatar` 기본값은 `self-end`(입력창이 있는 채팅 UI
          관례 — 아바타가 마지막 줄 바닥에 맞는다)다. 이 화면은 실측상 아바타가 라벨 첫
          줄과 상단이 맞아야 하고 하단 입력창도 없어, 기본값을 확인한 뒤에도 `self-start`
          오버라이드를 유지하기로 판단했다. */}
      <MessageAvatar className="size-10 self-start overflow-visible rounded-xl bg-transparent">
        <AiAvatar />
      </MessageAvatar>
      <MessageContent className="min-w-0 flex-1 items-start gap-4">
        {/* 실측: 13px/18 w600 `ink`(2026-09-06 스케일 축소, 기존 14px). */}
        <MessageHeader className="px-0 text-app-label font-semibold text-ink">
          {label}
        </MessageHeader>
        {body != null && (
          <Bubble
            variant="secondary"
            align="start"
            className={["w-full", bubbleMaxWidthClassName].join(" ")}
          >
            <BubbleContent className="w-full">
              {/* 실측: 15px/22.5 w500 `ink`(2026-09-06 스케일 축소, 기존 16px). */}
              <p className="whitespace-pre-line text-left text-app-body font-medium text-ink">
                {body}
              </p>
            </BubbleContent>
          </Bubble>
        )}
        {children}
      </MessageContent>
    </Message>
  );
}
