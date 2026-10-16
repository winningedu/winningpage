import { LINK_KIND_DEFINITIONS, LINK_KIND_LABELS } from "@/lib/inquiry/labels";
import type { LinkKind } from "@/lib/inquiry/types";
import { CARD, CARD_TITLE } from "./styles";

const KINDS: LinkKind[] = ["followup", "transfer", "critique", "extension"];

// 연계 규칙 카드. 연계 유형 4종의 한 줄 정의(서버 LINK_KIND_DEFINITIONS 와 같은 문구)를 보여 준다.
export default function LinkRulesCard() {
  return (
    <section aria-labelledby="inquiry-link-rules-heading" className={CARD}>
      <h2 id="inquiry-link-rules-heading" className={CARD_TITLE}>
        연계 규칙
      </h2>
      <p className="mt-2 text-app-caption text-ink-sub">
        고른 활동에서 이어지는 방식은 네 가지예요.
      </p>
      <dl className="mt-3 flex flex-col gap-2.5">
        {KINDS.map((kind) => (
          <div key={kind}>
            <dt className="text-app-label font-semibold text-ink-strong">
              {LINK_KIND_LABELS[kind]}
            </dt>
            <dd className="text-app-caption text-ink-sub">
              {LINK_KIND_DEFINITIONS[kind]}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
