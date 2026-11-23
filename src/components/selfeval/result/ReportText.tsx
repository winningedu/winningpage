import {
  chipLabel,
  circledNumber,
  sentenceNumbers,
} from "@/lib/selfeval/evidence";
import type { GenerationSections } from "@/lib/selfeval/types";

// 생성 본문(시안 36~38). 문장 단위로 그린다.
//   문장 앞에 본문 순서의 번호(①, ②, ...)를, 뒤에 근거 칩(유형 글자와 항목 이름)을 붙인다.
//   문장을 누르면 우측 "문장 근거" 패널이 열리고 근거를 다시 고를 수 있다. 근거가 없는 문장도 누를 수 있다.
//   확인 필요 문장(근거 없음 등)  노란 배경(학생이 맞다고 하거나 지우기 전까지)
// 번호와 칩은 화면 표시일 뿐이다. 복사용 본문은 resultLogic.paragraphTexts 로 문장만 잇는다(명세 No.64).

type Props = {
  sections: GenerationSections;
  selectedId: string | null;
  onSelect: (sentenceId: string) => void;
};

export default function ReportText({ sections, selectedId, onSelect }: Props) {
  const numbers = sentenceNumbers(sections);
  return (
    <div className="flex flex-col gap-4">
      {sections.paragraphs.map((paragraph, pi) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 문단은 순서가 곧 식별자다
        <p key={pi} className="text-app-body leading-[1.9] text-ink-strong">
          {paragraph.sentences.map((sentence) => {
            const pending = sentence.feeling && !sentence.confirmed;
            const selected = selectedId === sentence.id;
            const tone = pending ? "rounded bg-surface-warning px-0.5" : "";
            const underline =
              sentence.evidence.length > 0
                ? "underline decoration-accent decoration-2 underline-offset-4"
                : "";
            const labels = [
              ...new Set(sentence.evidence.map((e) => chipLabel(e))),
            ];
            return (
              <span key={sentence.id}>
                <span
                  aria-hidden="true"
                  className="mr-0.5 align-middle text-app-caption font-semibold text-ink-sub"
                >
                  {circledNumber(numbers.get(sentence.id) ?? 0)}
                </span>
                <button
                  type="button"
                  onClick={() => onSelect(sentence.id)}
                  className={`cursor-pointer text-left ${underline} ${tone} ${selected ? "bg-surface-02" : ""}`}
                >
                  {sentence.text}
                </button>
                {labels.map((label) => (
                  <span
                    key={label}
                    className="ml-1 rounded-full bg-surface-04 px-1.5 py-0.5 align-middle text-app-badge font-semibold text-ink-sub"
                  >
                    {label}
                  </span>
                ))}{" "}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}
