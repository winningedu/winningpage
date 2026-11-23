import { REPORT_COVER_STEPS } from "@/components/report/ReportCoverPage";
import type {
  ReportCh05,
  ReportNextStepKey,
  ReportTagCard,
  ReportTextCard,
} from "@/lib/selfeval/reportTypes";
import TagChip from "./TagChip";

// 값이 없거나 읽지 못한 카드는 문장을 만들지 않고 이 문구만 쓴다(명세 No.166, 167, 197, 202).
const NONE_TEXT = "이용 기록 없음";
const ERROR_TEXT = "불러오지 못함";

const NEXT_STEP_TITLES: Record<ReportNextStepKey, string> = {
  memo_detail: "수기 과정 서술 보강",
  finish_in_progress: "진행 중 기록 완성",
  verify_action: "실천 내용 검증",
  use_elsewhere: "다른 과목에서 활용",
  verification_fix: "검증에서 고칠 곳",
};

const CIRCLED_STEP = ["①", "②", "③", "④"];

function textCard(card: ReportTextCard): string {
  if (card.state === "error") return ERROR_TEXT;
  if (card.state === "none" || card.text === null) return NONE_TEXT;
  return card.text;
}

/** 예: P1(수학), P2(수학) (D2는 진행 중) */
function tagCard(card: ReportTagCard): string {
  if (card.items.length === 0 && card.inProgressTags.length === 0)
    return NONE_TEXT;
  const items = card.items.map((i) => `${i.tag}(${i.subject})`).join(", ");
  const progress =
    card.inProgressTags.length > 0
      ? `(${card.inProgressTags.join(", ")}는 진행 중)`
      : "";
  return [items, progress].filter(Boolean).join(" ");
}

export default function Ch05View({ ch }: { ch: ReportCh05 }) {
  const { counts, cards } = ch;
  const countCards = [
    {
      n: counts.completedReports,
      label: `완료 보고서 (${counts.subjectCount}과목)`,
    },
    { n: counts.reflectedReports, label: "자기평가에 반영된 보고서" },
    { n: counts.reflectedMemos, label: "반영된 수기 기록" },
    {
      n: counts.linkedSubjects.length,
      label: `연계된 교과 (${counts.linkedSubjects.join(", ")})`,
    },
  ];
  const stageTexts = [
    textCard(cards.diagnosis),
    textCard(cards.goal),
    textCard(cards.growth),
    tagCard(cards.performance),
    tagCard(cards.inquiry),
    cards.selfeval.text,
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {countCards.map((c) => (
          <div
            key={c.label}
            data-testid="count-card"
            className="rounded-2xl bg-[#0b2545] p-4 text-white"
          >
            <p className="text-app-title font-extrabold">{c.n}</p>
            <p className="mt-1 text-app-caption">{c.label}</p>
          </div>
        ))}
      </div>
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {REPORT_COVER_STEPS.map((step, index) => (
          <li
            key={step.label}
            data-testid="stage-card"
            className="rounded-2xl p-3"
            style={{ backgroundColor: step.bg, color: step.fg }}
          >
            <p className="text-app-caption font-bold">
              {String(index + 1).padStart(2, "0")}
            </p>
            <p className="mt-1 text-app-body font-bold">{step.label}</p>
            <p className="mt-2 text-app-caption leading-[1.6]">
              {stageTexts[index]}
            </p>
            {index === 0 && cards.diagnosis.date && (
              <p className="mt-1 text-app-caption opacity-80">
                진단일 {cards.diagnosis.date}
              </p>
            )}
          </li>
        ))}
      </ol>
      {ch.nextSteps.length > 0 && (
        <section aria-label="다음 단계 제안">
          <h3 className="text-app-card-title font-bold text-ink-strong">
            다음 단계 제안
          </h3>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ch.nextSteps.map((step, index) => (
              <li
                key={step.key}
                data-testid="next-step"
                className="rounded-2xl border border-line p-4"
              >
                <p className="flex items-center gap-2 text-app-label font-bold text-ink-strong">
                  <span>{CIRCLED_STEP[index]}</span>
                  <TagChip tag={step.tag} />
                  {NEXT_STEP_TITLES[step.key]}
                </p>
                {step.text && (
                  <p className="mt-2 text-app-label leading-[1.7] text-ink-sub">
                    {step.text}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
