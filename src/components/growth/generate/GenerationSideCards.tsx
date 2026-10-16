import { Check } from "lucide-react";
import { CARD, CARD_TITLE } from "../start/cardStyles";
import { entitlementStatus } from "./generateView";
import type { GenerationState } from "./generationEngine";

const PRINCIPLES = [
  "모든 진단에 근거 활동을 연결해요",
  "확인되는 사실과 앞으로의 추천을 배지로 구분해요",
  "수치에는 계산식과 판정 기준을 함께 적어요",
  "학생 조사 응답은 인용한 문항 번호를 남겨요",
];

export function EntitlementCard({
  state,
  quotaRemaining,
}: {
  state: GenerationState;
  /** 부트스트랩의 남은 이용권. 모르면 null 이고 그 줄을 그리지 않는다. */
  quotaRemaining: number | null;
}) {
  const status = entitlementStatus(state);
  return (
    <section className={CARD}>
      <h2 className={CARD_TITLE}>이용권</h2>
      <dl className="mt-3 flex flex-col gap-2 text-app-label">
        {quotaRemaining !== null && (
          <div className="flex items-center justify-between">
            <dt className="text-ink-sub">남은 이용권</dt>
            <dd className="font-bold text-ink-strong">{quotaRemaining}회</dd>
          </div>
        )}
        {status && (
          <div className="flex items-center justify-between">
            <dt className="text-ink-sub">상태</dt>
            <dd className="flex items-center gap-2 font-bold text-ink-strong">
              {status.label}
              {status.note && (
                <span className="rounded-full bg-surface-02 px-2 py-0.5 text-app-caption font-semibold">
                  {status.note}
                </span>
              )}
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-3 text-app-caption text-ink-sub">
        1단계가 성공하면 1회 차감돼요. 생성이 실패하면 차감은 자동으로 복구돼요.
      </p>
    </section>
  );
}

export function PrinciplesCard() {
  return (
    <section className={CARD}>
      <h2 className={CARD_TITLE}>근거 표시 원칙</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {PRINCIPLES.map((text) => (
          <li
            key={text}
            className="flex items-start gap-2 text-app-label text-ink-strong"
          >
            <Check
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-primary"
              strokeWidth={3}
            />
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}
