import { NOT_PRODUCED, SUBMISSION_LABELS } from "@/lib/inquiry/labels";
import type { EvaluationView } from "@/lib/inquiry/types";
import {
  buildChecklistSummary,
  buildCoreErrorRows,
  buildFixRows,
  buildPlaceholderLines,
  buildRubricRows,
  buildSourceRows,
  type LevelTone,
  summaryLine,
} from "./evaluateLogic";

// 평가 리포트 본문. 평가 화면과 보관함 상세가 같은 컴포넌트를 쓴다(계획서 §2 37).
// 마크다운은 렌더하지 않고 서버가 준 문장을 그대로 텍스트로 그린다.
const CARD = "rounded-xl border border-border bg-white p-6";
const TH = "px-3 py-2 text-left text-app-label font-semibold text-ink-sub";
const TD = "px-3 py-2 align-top text-app-label text-ink-strong";
const TABLE_WRAP = "overflow-x-auto rounded-lg border border-border";
const BADGE = "rounded-full px-2 py-0.5 text-app-badge font-semibold";

const TONE_CLASS: Record<LevelTone, string> = {
  good: "bg-surface-04 text-ink-strong",
  mid: "bg-surface-02 text-primary",
  low: "bg-error/10 text-error",
};

type FixRow = ReturnType<typeof buildFixRows>[number];

function FixTable({ label, rows }: { label: string; rows: FixRow[] }) {
  return (
    <div className={TABLE_WRAP}>
      <table aria-label={label} className="w-full border-collapse">
        <thead className="bg-surface-04">
          <tr>
            <th scope="col" className={TH}>
              위치
            </th>
            <th scope="col" className={TH}>
              문제
            </th>
            <th scope="col" className={TH}>
              영향
            </th>
            <th scope="col" className={TH}>
              할 일
            </th>
            <th scope="col" className={TH}>
              확인 기준
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={`${r.location}-${r.problem}`}
              className="border-t border-border"
            >
              <th scope="row" className={`${TD} font-semibold`}>
                {r.location}
              </th>
              <td className={TD}>{r.problem}</td>
              <td className={TD}>{r.impact}</td>
              <td className={TD}>{r.action}</td>
              <td className={TD}>{r.check}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Props = { evaluation: EvaluationView; compact?: boolean };

export default function EvaluationBody({ evaluation, compact = false }: Props) {
  const rubricRows = buildRubricRows(evaluation.items);
  const errorRows = buildCoreErrorRows(evaluation.coreErrors);
  const fixRows = buildFixRows(evaluation.fixFirst);
  const mustFixRows = buildFixRows(evaluation.mustFix);
  const checklist = buildChecklistSummary(evaluation.checklist);
  const sourceRows = buildSourceRows(evaluation.sources);
  const placeholderLines = buildPlaceholderLines(evaluation.placeholders);

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="총점" className={CARD}>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <p className="flex items-baseline gap-2">
            <span className="text-app-title font-bold text-ink-strong">
              {evaluation.total}
            </span>
            <span className="text-app-label text-ink-sub">/ 100</span>
          </p>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={`${BADGE} w-fit bg-surface-02 text-primary`}>
              {SUBMISSION_LABELS[evaluation.label]}
            </span>
            <p className="text-app-body text-ink-strong">
              {summaryLine(evaluation.coreErrors.length)}
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="eval-rubric" className={CARD}>
        <h2
          id="eval-rubric"
          className="text-app-section font-bold text-ink-strong"
        >
          평가표 (6항목, 수준 0~4)
        </h2>
        <p className="mt-1 mb-4 text-app-label text-ink-sub">
          항목 점수 = 배점 × 수준 ÷ 4. 충족한 요건과 못 채운 요건을 함께 보여
          줘요.
        </p>
        <div className={TABLE_WRAP}>
          <table aria-label="평가표" className="w-full border-collapse">
            <thead className="bg-surface-04">
              <tr>
                <th scope="col" className={TH}>
                  평가 항목
                </th>
                <th scope="col" className={TH}>
                  점수
                </th>
                <th scope="col" className={TH}>
                  수준
                </th>
                <th scope="col" className={TH}>
                  충족과 미충족
                </th>
              </tr>
            </thead>
            <tbody>
              {rubricRows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <th scope="row" className={`${TD} font-semibold`}>
                    {r.label}
                  </th>
                  <td className={TD}>{r.scoreText}</td>
                  <td className={TD}>
                    <span className={`${BADGE} ${TONE_CLASS[r.tone]}`}>
                      {r.levelText}
                    </span>
                  </td>
                  <td className={TD}>
                    <p>{r.metText}</p>
                    {r.capReason && (
                      <p className="mt-1 text-error">{r.capReason}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="eval-core" className={CARD}>
        <div className="flex items-center gap-2">
          <h2
            id="eval-core"
            className="text-app-section font-bold text-ink-strong"
          >
            핵심 오류
          </h2>
          <span
            className={`${BADGE} ${errorRows.length > 0 ? "bg-error/10 text-error" : "bg-surface-04 text-ink-strong"}`}
          >
            {errorRows.length}건
          </span>
        </div>
        {errorRows.length === 0 ? (
          <p className="mt-2 text-app-label text-ink-sub">
            질문과 측정변수, 대리 지표, 원인 단정, 증거를 넘은 단정, 출처 없는
            수치, 미작성 자리를 모두 확인했어요. 고쳐야 할 핵심 오류는 없어요
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {errorRows.map((e) => (
              <li key={e.key} className="rounded-lg border border-error p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-app-body font-semibold text-error">
                    {e.label}
                  </p>
                  <span className="text-app-caption text-ink-sub">
                    {e.location}
                  </span>
                </div>
                <p className="mt-1 text-app-label text-ink-strong">
                  {e.detail}
                </p>
                <p className="mt-1 text-app-label text-ink-sub">{e.effect}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="eval-fix" className={CARD}>
        <h2
          id="eval-fix"
          className="text-app-section font-bold text-ink-strong"
        >
          먼저 고칠 것
        </h2>
        <p className="mt-1 mb-4 text-app-label text-ink-sub">
          위치, 문제, 탐구에 미치는 영향, 할 일, 확인 기준 순서예요. 핵심 오류가
          있으면 먼저 보여 줘요.
        </p>
        {fixRows.length === 0 ? (
          <p className="text-app-body text-ink-strong">먼저 고칠 것이 없어요</p>
        ) : (
          <FixTable label="먼저 고칠 것" rows={fixRows} />
        )}
      </section>

      {mustFixRows.length > 0 && (
        <section aria-labelledby="eval-must" className={CARD}>
          <h2
            id="eval-must"
            className="text-app-section font-bold text-ink-strong"
          >
            필수 수정 목록
          </h2>
          <p className="mt-1 mb-4 text-app-label text-ink-sub">
            먼저 고칠 것 3개 밖에 남은 수정이에요. 제출 전에 함께 고쳐 주세요.
          </p>
          <FixTable label="필수 수정 목록" rows={mustFixRows} />
        </section>
      )}

      <section aria-labelledby="eval-checklist" className={CARD}>
        <div className="flex items-center gap-2">
          <h2
            id="eval-checklist"
            className="text-app-section font-bold text-ink-strong"
          >
            설계 대비 이행표
          </h2>
          <span className={`${BADGE} bg-surface-02 text-primary`}>
            {checklist.metCount} / {checklist.total} 충족
          </span>
        </div>
        <p className="mt-2 text-app-label text-ink-sub">
          작성 화면의 점검과 같은 기준이에요.
          {checklist.unmetNames.length > 0 &&
            ` 못 채운 항목: ${checklist.unmetNames.join(", ")}`}
        </p>
      </section>

      <section aria-labelledby="eval-sources" className={CARD}>
        <h2
          id="eval-sources"
          className="text-app-section font-bold text-ink-strong"
        >
          출처 확인
        </h2>
        {sourceRows.length === 0 ? (
          <p className="mt-2 text-app-label text-ink-sub">
            확인할 참고 자료가 없어요
          </p>
        ) : (
          <div className={`${TABLE_WRAP} mt-3`}>
            <table aria-label="출처 확인" className="w-full border-collapse">
              <thead className="bg-surface-04">
                <tr>
                  <th scope="col" className={TH}>
                    자료
                  </th>
                  <th scope="col" className={TH}>
                    상태
                  </th>
                </tr>
              </thead>
              <tbody>
                {sourceRows.map((s) => (
                  <tr key={s.text} className="border-t border-border">
                    <th scope="row" className={`${TD} font-semibold`}>
                      {s.text}
                    </th>
                    <td className={TD}>
                      <span
                        className={`${BADGE} bg-surface-04 text-ink-strong`}
                      >
                        {s.statusLabel}
                      </span>
                      {s.note && (
                        <span className="ml-2 text-app-caption text-ink-sub">
                          {s.note}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {placeholderLines.length > 0 && (
        <section aria-label="남은 자리표시자" className={CARD}>
          <h2 className="text-app-section font-bold text-ink-strong">
            아직 쓰지 않은 자리가 남아 있어요
          </h2>
          <ul className="mt-2 flex flex-col gap-1 text-app-label text-ink-strong">
            {placeholderLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {!compact && (
        <section aria-labelledby="eval-not" className={CARD}>
          <h2
            id="eval-not"
            className="text-app-section font-bold text-ink-strong"
          >
            이 평가가 하지 않는 것
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {NOT_PRODUCED.map((t) => (
              <li
                key={t}
                className="rounded-full bg-surface-04 px-3 py-1 text-app-label text-ink-sub"
              >
                {t}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
