import type { ReportCh01 as Ch01 } from "@/lib/selfeval/reportTypes";
import { circled, tagKind } from "./reportFormat";
import TagChip from "./TagChip";

const LEGEND: Record<string, string> = {
  P: "수행평가 보고서",
  D: "심화탐구 보고서",
  H: "학생 수기 수행보고 (학생 업로드)",
  A: "활동 기록",
};

// 범례는 P, D, H 를 늘 그리고 A 는 본문에 A 꼬리표가 있을 때만 더한다.
function legendKinds(ch: Ch01): string[] {
  const hasA = ch.paragraphs.some((p) =>
    p.sentences.some((s) => s.tags.some((t) => tagKind(t) === "A")),
  );
  return hasA ? ["P", "D", "H", "A"] : ["P", "D", "H"];
}

export default function ReportCh01({
  ch,
  title,
  summaryLine,
}: {
  ch: Ch01;
  title: string;
  summaryLine: string;
}) {
  return (
    <>
      <div className="rounded-2xl border border-line p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-app-card-title font-bold text-ink-strong">
            {title}
          </h3>
          <p className="text-app-caption text-ink-sub">{summaryLine}</p>
        </div>
        <div className="mt-4 flex flex-col gap-4">
          {ch.paragraphs.map((paragraph, index) => (
            <p
              // 문단은 순서가 곧 정체성이고 재정렬되지 않는다.
              // biome-ignore lint/suspicious/noArrayIndexKey: 읽기 전용 고정 목록
              key={index}
              className="text-app-body leading-[2] text-ink-strong"
            >
              <span className="mr-2 inline-block rounded bg-[#0b2545] px-1.5 py-0.5 align-middle text-[0.6875rem] font-bold leading-none text-white">
                문단 {index + 1}
              </span>
              {paragraph.sentences.map((sentence) => (
                <span key={sentence.n} data-testid={`sentence-${sentence.n}`}>
                  {sentence.text}
                  <sup className="mx-1 text-app-caption text-ink-natural">
                    {circled(sentence.n)}
                  </sup>
                  {sentence.needsConfirm && (
                    <span className="mr-1 inline-block rounded bg-surface-info px-1.5 py-0.5 align-middle text-[0.6875rem] font-bold leading-none text-ink-strong">
                      확인 필요
                    </span>
                  )}
                  {sentence.tags.map((tag) => (
                    <TagChip key={tag} tag={tag} className="mr-1" />
                  ))}{" "}
                </span>
              ))}
            </p>
          ))}
        </div>
      </div>
      <ul
        data-testid="legend"
        className="flex flex-wrap gap-x-4 gap-y-1 text-app-caption text-ink-sub"
      >
        {legendKinds(ch).map((kind) => (
          <li key={kind} className="flex items-center gap-1.5">
            <TagChip tag={kind} />
            {LEGEND[kind]}
          </li>
        ))}
        <li>① 문장 번호 (이후 장에서 참조)</li>
      </ul>
    </>
  );
}
