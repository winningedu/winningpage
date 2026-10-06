import type { QuotaView } from "@/lib/inquiry/types";
import { CARD, CARD_TITLE } from "./styles";

// 이용 횟수 카드. 잔여 회차를 n / m 으로, 값이 없으면(무제한 또는 회차 개념 없음) "무제한"으로 보여 준다.
export default function QuotaCard({ quota }: { quota: QuotaView }) {
  const limited = quota.quotaRemaining !== null && quota.quotaTotal !== null;
  return (
    <section aria-labelledby="inquiry-quota-heading" className={CARD}>
      <h2 id="inquiry-quota-heading" className={CARD_TITLE}>
        이용 횟수
      </h2>
      <p className="mt-3 flex items-baseline gap-1.5">
        {limited ? (
          <>
            <span className="text-app-title font-bold text-ink-strong">
              {quota.quotaRemaining}
            </span>
            <span className="text-app-label text-ink-sub">
              / {quota.quotaTotal}회
            </span>
          </>
        ) : (
          <span className="text-app-title font-bold text-ink-strong">
            무제한
          </span>
        )}
      </p>
      <p className="mt-2 text-app-caption text-ink-sub">
        주제 추천이 성공할 때 1회 차감돼요. 재추천, 설계, 평가, 재평가는
        차감하지 않아요
      </p>
    </section>
  );
}
