import { trackEvent } from "@/lib/analytics";
import TopicCard, { type Topic } from "./TopicCard";

// STEP3 추천 주제 3카드 묶음 + `다른 주제 1번 더 추천받기` — docs/수행평가-상세-명세.md §5.10
// (`3754:3629`/`3754:3744` 실측, QA 행277 — 9/4 시안 갱신으로 버튼 라벨 정정).
//
// ── 실측 (세로 리듬)
//   카드 상단 y: 1007 / 1221 / 1435 → 피치 13.375rem(214) = 카드 높이 194 + 간격 20.
//   마지막 카드 하단 1629 → 재추천 버튼 상단 1649 → 같은 1.25rem(20).
//   즉 카드 3장과 버튼이 **하나의 세로 스택에 gap 1.25rem**으로 놓인 모양이라 `gap-5`
//   하나로 두 간격이 동시에 맞는다.
//   재추천 버튼 8.125rem×2.5rem(130×40) r0.625rem(10) stroke `#d9d9d9`(=`performance-line`),
//   라벨 0.875rem/1.125rem w500 `#525252`(=`ink`), 좌측 정렬(x=456, 카드 좌변과 같은 축).
//
//   버튼은 공용 `OutlineButton`을 쓰지 않는다 — 그쪽 치수 프리셋(h 3.25rem/3.75rem,
//   `rounded-xl`, 기본 fullWidth)이 여기 실측(2.5rem/`0.625rem`/고정 8.125rem)과 하나도
//   맞지 않아 전부 `className`으로 덮어야 하고, 이 저장소는 tailwind-merge가 없어 같은
//   속성의 유틸을 겹쳐 쓰면 어느 쪽이 이기는지 예측할 수 없다(OutlineButton 상단 주석).
//
// ── 재추천은 "교체"다 (§5.10 「미정」에 대한 결정)
//   §5.10은 재추천이 교체인지 추가인지 미정으로 남겼다. **교체로 구현한다** — 서버는
//   라운드마다 새 3건을 만들고 응답에 그 라운드만 실어 준다(`recommend-topics.js`의
//   `topics: insertedRows`). 이전 라운드 카드를 화면에 남겨 두면 사용자가 그것을 눌러
//   상세 모달 → 확정까지 갈 수 있는데, 그 순간 "다시 추천받은 뒤 옛 주제를 고른" 상태가
//   되어 어느 쪽이 현재 제안인지 화면이 스스로 모순된다. 옛 라운드는 DB에 남아 있으므로
//   기록이 사라지는 것도 아니다.
//
// ── 상한 안내 (§9.3, QA 행278로 라운드 상한 자체가 2로 조정됨 — `recommend-topics.ts`
//   `MAX_ROUNDS` 주석 참고. 최초 추천 1회 + 재추천 1회 = 총 2라운드다.)
//   상한이 몇이든 이 컴포넌트는 `maxRounds` prop(서버 응답 `maxRounds`)을 그대로 읽으므로
//   숫자를 하드코딩하지 않는다. 초과 시 서버가 `409 ROUND_LIMIT`을 준다.
//   버튼을 눌러 보고 나서야 막히는 것보다 도달 시점에 미리 잠그는 편이 낫다 —
//   `round >= maxRounds`면 버튼을 비활성화하고 이유를 한 줄로 적는다. 서버가 그래도
//   `ROUND_LIMIT`을 돌려주면(다른 탭에서 이미 상한을 쓴 경우) 호출부가 `roundLimited`를
//   켜서 같은 안내로 수렴시킨다.
//   **재추천은 회차를 깎지 않는다**(§9.3 — RPC가 `already_charged`를 돌려주는 것이 정상
//   경로다). 그래서 이 버튼 근처에 회차 소모 경고를 붙이지 않는다.
//
// ── 상시 안내 (QA 행278)
//   한도에 도달하기 전에도 "재추천은 딱 1번뿐"이라는 사실을 미리 알려 달라는 요청이라,
//   버튼 아래 상시 문구를 하나 더 둔다. 남은 횟수(`round`/`maxRounds` 둘 다 서버 응답
//   실측값)를 그 자리에서 계산해 표기한다 — 별도 상수로 남은 횟수를 추정하면(이중 소스)
//   `MAX_ROUNDS`가 다시 바뀔 때 이 문구만 갱신을 놓칠 수 있다.
type TopicCardListProps = {
  /** 현재 라운드의 주제 3건. */
  topics?: Topic[];
  /** 현재 라운드(1-based). */
  round?: number;
  /** 라운드 상한. 기본 3(§9.3). */
  maxRounds?: number;
  /** 카드 클릭 → 상세 모달(P9). `onSelect`는 없다(§11.1 Q48). */
  onDetail?: (topic: Topic) => void;
  /** `다른 주제 1번 더 추천받기`. */
  onRegenerate?: () => void;
  /** 재추천 요청 진행 중. */
  regenerating?: boolean;
  /** 서버가 `409 ROUND_LIMIT`을 돌려준 뒤 켜진다. */
  roundLimited?: boolean;
  /** 재추천 실패 안내(모델 원문이 아니라 사람이 읽을 문구). */
  error?: string | null;
};

export default function TopicCardList({
  topics = [],
  round = 1,
  maxRounds = 2,
  onDetail,
  onRegenerate,
  regenerating = false,
  roundLimited = false,
  error = null,
}: TopicCardListProps) {
  const limitReached = roundLimited || round >= maxRounds;
  // 상시 안내에 쓸 남은 재추천 횟수 — `round`/`maxRounds` 둘 다 서버가 정본이라 그 값의
  // 차만 낸다(위 "상시 안내" 주석).
  const remainingRegenerations = Math.max(0, maxRounds - round);

  // 버튼을 잠그는 두 사유. **`disabled` 속성 대신 `aria-disabled`를 쓴다** — 포커스를 가진
  // 버튼이 `disabled`가 되면 브라우저가 포커스를 `<body>`로 떨어뜨려서, 방금 이 버튼을
  // 누른 키보드 사용자가 위치를 잃고 Tab을 처음부터 다시 밟아야 한다. `aria-disabled`는
  // 포커스를 유지한 채 보조기술에 "비활성"을 알리므로, 대신 클릭 핸들러에서 막는다.
  const locked = limitReached || regenerating;

  function handleRegenerateClick() {
    if (locked) return;
    trackEvent("ai_regenerate", { service: "performance", step: "topics" });
    onRegenerate?.();
  }

  return (
    <div className="flex w-full max-w-perf-bubble flex-col gap-5">
      {/* 카드 3장은 **목록**이다. 형제 `div`로 늘어놓으면 스크린리더에 서로 무관한 버튼
          3개로 읽혀 "항목 3개 / 지금 몇 번째"라는 문맥이 통째로 사라진다. 재추천 버튼과
          상한 안내가 같은 컨테이너에 있어 바깥을 리스트로 승격할 수는 없으므로 카드만
          감싼다. 바깥 `gap-5`가 그대로 마지막 카드↔버튼 1.25rem을 유지하므로 세로 리듬은
          변하지 않는다. Tailwind preflight가 `list-style: none`을 걸면 Safari/VoiceOver가
          리스트 롤을 떼어 버리므로 `role="list"`를 명시한다. */}
      {/* biome-ignore lint/a11y/noRedundantRoles: 위 주석 참고 — Safari/VoiceOver list role 복구 목적의 의도적 명시. */}
      <ul role="list" className="flex flex-col gap-5">
        {topics.map((topic, index) => (
          <li key={topic.id ?? index} className="w-full">
            <TopicCard
              index={index + 1}
              topic={topic}
              {...(onDetail ? { onDetail } : {})}
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleRegenerateClick}
          aria-disabled={locked}
          aria-busy={regenerating}
          className={[
            "flex h-10 w-32.5 items-center justify-center rounded-[0.625rem] border border-performance-line bg-white text-app-label font-medium text-ink transition-colors",
            locked ? "cursor-not-allowed opacity-50" : "hover:border-ink-sub",
          ].join(" ")}
        >
          다른 주제 1번 더 추천받기
        </button>

        {/* 상시 안내(QA 행278) — 한도 도달 전에도 항상 보인다. 한도 도달 뒤에는 아래
            `limitReached` 문구가 같은 자리를 대신하므로 여기서는 숨긴다(같은 취지의
            문구 두 줄이 겹치지 않게). */}
        {!limitReached && (
          <p className="text-app-label font-normal text-ink-sub">
            추가 추천은 1회로 한정되어 있어요. 신중하게 실행해 주세요. (남은
            추가 추천 {remainingRegenerations}회)
          </p>
        )}

        {/* 상한 안내·실패 안내 모두 시안에 없는 표면이다(§11.3 Q39 — 시안에 토스트가 없다).
            다른 STEP과 같은 관례로 카드 아래 한 줄 텍스트로만 만든다. */}
        {limitReached && (
          <p className="text-app-label font-normal text-ink-sub">
            주제 추천은 최대 {maxRounds}회까지 받을 수 있어요. 위 주제 중 하나를
            눌러 자세한 내용을 확인해 주세요.
          </p>
        )}

        {error && (
          <p role="alert" className="text-app-label text-[#d01c1c]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
