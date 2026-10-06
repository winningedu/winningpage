import { CARD, CARD_TITLE } from "@/components/growth/start/cardStyles";
import { Button } from "@/components/ui/button";
import type { SessionActivityView } from "@/lib/selfeval/types";
import type { VerificationSummary } from "./verifyLogic";

// 검증 화면 우측 세 카드(시안 43, 52): 검증 요약, 이번 작업, 저장.

const ROW =
  "flex items-center justify-between gap-2 text-app-label text-ink-strong";

export function SummaryCard({ summary }: { summary: VerificationSummary }) {
  return (
    <aside className={CARD} aria-label="검증 요약">
      <h2 className={CARD_TITLE}>검증 요약</h2>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-app-stat font-bold text-ink-strong">
          {summary.total} / 100
        </p>
        {summary.submittable ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-app-caption font-semibold text-emerald-800">
            제출 가능
          </span>
        ) : (
          <span className="rounded-full bg-error/10 px-2.5 py-0.5 text-app-caption font-semibold text-error">
            필수 수정 {summary.mandatoryCount}건
          </span>
        )}
      </div>
      <ul className="mt-4 flex flex-col gap-1.5">
        <li className={ROW}>전체 항목 {summary.totalChecks}</li>
        <li className={ROW}>통과 {summary.passChecks}</li>
        <li className={ROW}>확인 필요 {summary.needChecks}</li>
        <li className={ROW}>필수 수정 {summary.mandatoryCount}</li>
        <li className={ROW}>상투어 밀도 {summary.clicheDensity}</li>
        <li className={ROW}>수치 근거 {summary.numberCount}건</li>
        <li className={ROW}>문장 {summary.sentenceCount}개</li>
      </ul>
      <p className="mt-4 text-app-caption text-ink-sub">
        이 점수는 학교 채점이나 학생부 평가 예측이 아니라 위닝 내부 기준입니다
      </p>
    </aside>
  );
}

type WorkProps = {
  charged: boolean | null;
  quota: { remaining: number | null; total: number | null } | null;
  /** 적용된 성장설계 방향의 대주제. 없으면 "방향 없이 진행". */
  direction: string | null;
  activities: SessionActivityView[];
};

export function WorkCard({ charged, quota, direction, activities }: WorkProps) {
  const core = activities.filter((a) => a.role === "core");
  const support = activities.filter((a) => a.role === "support");
  return (
    <aside className={CARD} aria-label="이번 작업">
      <h2 className={CARD_TITLE}>이번 작업</h2>
      <ul className="mt-3 flex flex-col gap-1.5">
        {charged && <li className={ROW}>1회 차감</li>}
        {quota && quota.remaining !== null && quota.total !== null && (
          <li className={ROW}>
            남은 횟수 {quota.remaining} / {quota.total}
          </li>
        )}
        <li className={ROW}>{direction ?? "방향 없이 진행"}</li>
        {core.map((a) => (
          <li key={a.activityRecordId} className={ROW}>
            핵심 {a.record.topic ?? "자료 없음"}
          </li>
        ))}
        {support.map((a) => (
          <li key={a.activityRecordId} className={ROW}>
            보조 {a.record.topic ?? "자료 없음"}
          </li>
        ))}
      </ul>
    </aside>
  );
}

type SaveProps = {
  submittable: boolean;
  busy: boolean;
  onSave: () => void;
  onCopy: () => void;
  onBack: () => void;
};

export function SaveCard({
  submittable,
  busy,
  onSave,
  onCopy,
  onBack,
}: SaveProps) {
  return (
    <aside className={CARD} aria-label="저장">
      <h2 className={CARD_TITLE}>저장</h2>
      <div className="mt-3 flex flex-col gap-2">
        <Button
          type="button"
          size="lg"
          className="h-10 text-app-label font-semibold"
          disabled={!submittable || busy}
          onClick={onSave}
        >
          최종본으로 저장
        </Button>
        {!submittable && (
          <p className="text-app-caption text-ink-sub">
            필수 수정이 남아 있어 저장할 수 없어요
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-10 text-app-label font-medium"
          onClick={onCopy}
        >
          전체 복사
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-10 text-app-label font-medium"
          onClick={onBack}
        >
          작성 화면으로
        </Button>
      </div>
    </aside>
  );
}
