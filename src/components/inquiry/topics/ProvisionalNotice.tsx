import { Button } from "@/components/ui/button";
import { PROVISIONAL_TOPIC_NOTE } from "@/lib/inquiry/labels";

type Props = {
  /** 첫 카드의 followUpQuestions. */
  questions: string[];
  onGoInfo: () => void;
};

export default function ProvisionalNotice({ questions, onGoInfo }: Props) {
  return (
    <section
      aria-label="예비 주제 안내"
      className="rounded-xl bg-amber-50 px-6 py-4"
    >
      <p className="text-app-label font-bold text-ink-strong">
        {PROVISIONAL_TOPIC_NOTE}
      </p>
      {questions.length > 0 && (
        <>
          <p className="mt-3 text-app-caption text-ink-sub">
            이전에 한 활동이 있다면 아래 질문을 떠올려 보세요.
          </p>
          <ul className="mt-2 grid grid-cols-3 gap-3">
            {questions.map((q) => (
              <li
                key={q}
                className="rounded-lg bg-white px-4 py-3 text-app-caption text-ink-strong"
              >
                {q}
              </li>
            ))}
          </ul>
        </>
      )}
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="mt-4 h-10 px-5 text-app-label"
        onClick={onGoInfo}
      >
        활동 적으러 정보 입력으로
      </Button>
    </section>
  );
}
