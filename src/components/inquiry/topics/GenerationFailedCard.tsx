import { Button } from "@/components/ui/button";
import { MAX_MODEL_ATTEMPTS } from "@/lib/inquiry/labels";

type Props = {
  variant: "failed" | "terminal";
  /** 어느 호출이 실패했는지. 제목과 본문 문구가 달라진다. */
  mode: "recommend" | "plan";
  /** 서버가 알려 준 시도 횟수. 모르면 null. */
  attempts: number | null;
  /** 이 세션에서 이미 이용 횟수가 차감됐는지. */
  charged: boolean;
  onRetry: () => void;
  onChangeStart: () => void;
  onRestart: () => void;
};

function attemptsText(attempts: number | null, subject: string): string {
  if (attempts === null) return `조건에 맞는 ${subject}를 만들지 못했어요.`;
  const count = attempts === 2 ? "두 번" : `${attempts}번`;
  return `${count} 시도했지만 조건에 맞는 ${subject}를 만들지 못했어요.`;
}

export default function GenerationFailedCard({
  variant,
  mode,
  attempts,
  charged,
  onRetry,
  onChangeStart,
  onRestart,
}: Props) {
  if (variant === "terminal") {
    return (
      <section
        role="alert"
        className="rounded-xl border border-line/60 bg-white px-6 py-6"
      >
        <p className="text-app-card-title font-bold text-ink-strong">
          이 세션은 종결됐어요
        </p>
        <p className="mt-2 text-app-label text-ink-sub">
          이 세션은 종결됐어요. 차감된 이용 횟수는 복구됐어요.
        </p>
        <Button
          type="button"
          size="lg"
          className="mt-4 h-10 px-5 text-app-label"
          onClick={onRestart}
        >
          처음부터 다시 시작
        </Button>
      </section>
    );
  }

  const billing = charged
    ? "차감된 이용 횟수는 종결 시 복구돼요."
    : "이용 횟수는 차감되지 않았어요.";
  return (
    <section
      role="alert"
      className="rounded-xl border border-line/60 bg-white px-6 py-6"
    >
      <p className="text-app-card-title font-bold text-ink-strong">
        {mode === "plan"
          ? "설계 리포트를 만들지 못했어요"
          : "주제를 만들지 못했어요"}
      </p>
      <p className="mt-2 text-app-label text-ink-sub">
        {`${attemptsText(attempts, mode === "plan" ? "설계" : "주제")} ${billing}`}
      </p>
      {attempts !== null && (
        <p className="mt-1 text-app-caption text-ink-sub">
          {`시도 ${attempts} / ${MAX_MODEL_ATTEMPTS}`}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <Button
          type="button"
          size="lg"
          className="h-10 px-5 text-app-label"
          onClick={onRetry}
        >
          다시 시도
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-10 px-5 text-app-label"
          onClick={onChangeStart}
        >
          출발 활동 바꾸기
        </Button>
      </div>
    </section>
  );
}
