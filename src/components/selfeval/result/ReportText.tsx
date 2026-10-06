import type { GenerationSections } from "@/lib/selfeval/types";

// 생성 본문(시안 36~38). 문장 단위로 그린다.
//   활동 근거 문장  파란 밑줄 버튼, 누르면 우측 "문장 근거" 패널이 열린다.
//   학생 수정 문장  "학생 수정" 표시
//   확인 필요 느낌 문장  노란 배경(학생이 맞다고 하거나 지우기 전까지)

type Props = {
  sections: GenerationSections;
  selectedId: string | null;
  onSelect: (sentenceId: string) => void;
};

export default function ReportText({ sections, selectedId, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {sections.paragraphs.map((paragraph, pi) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 문단은 순서가 곧 식별자다
        <p key={pi} className="text-app-body leading-[1.9] text-ink-strong">
          {paragraph.sentences.map((sentence) => {
            const pending = sentence.feeling && !sentence.confirmed;
            const evidence = sentence.evidence;
            const fromActivity = evidence !== null && "activityId" in evidence;
            const selected = selectedId === sentence.id;
            const tone = pending ? "rounded bg-surface-warning px-0.5" : "";
            return (
              <span key={sentence.id}>
                {fromActivity ? (
                  <button
                    type="button"
                    onClick={() => onSelect(sentence.id)}
                    className={`cursor-pointer text-left underline decoration-accent decoration-2 underline-offset-4 ${tone} ${selected ? "bg-surface-02" : ""}`}
                  >
                    {sentence.text}
                  </button>
                ) : (
                  <span className={tone}>{sentence.text}</span>
                )}
                {evidence !== null && "student" in evidence && (
                  <span className="ml-1 rounded-full bg-surface-04 px-1.5 py-0.5 align-middle text-app-badge font-semibold text-ink-sub">
                    학생 수정
                  </span>
                )}{" "}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}
