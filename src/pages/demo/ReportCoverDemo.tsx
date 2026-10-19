// 리포트 표지 실측 데모(개발 전용, /demo/report-cover). 표지를 로컬에서 반복 실측하는
// 화면이라 디자인 대상이 아니다. 좌측 조작 패널은 인쇄 영역(print-root) 밖에 둔다.
//
// 인쇄 규칙을 실제와 맞추려고 학습진단 리포트와 같은 report-print.css 를 가져온다.
// 한계: DiagnosisReportView 의 DIAGNOSIS_REPORT_PAGE_RULE(@page A4 여백 0, 인쇄 시
// html font-size 3mm)는 export 되지 않아 여기서 마운트하지 않는다. a4 방식의 인쇄 폭은
// 그 규칙이 없으면 실제 리포트와 다를 수 있다.
import { useState } from "react";
import "@/styles/report-print.css";
import "@/styles/report-responsive.css";
import {
  REPORT_COVER_PRESETS,
  type ReportCoverKind,
} from "@/components/report/coverPresets";
import ReportCoverPage, {
  type ReportCoverFlowPrintMode,
  type ReportCoverPageVariant,
} from "@/components/report/ReportCoverPage";
import { useReportPdfSave } from "@/lib/report/useReportPdfSave";
import {
  buildCoverFixture,
  type CoverFixtureOptions,
} from "./reportCoverFixtures";

const KINDS = Object.keys(REPORT_COVER_PRESETS) as ReportCoverKind[];
const SCALES = [50, 75, 100] as const;

const OPTION_TOGGLES: { key: keyof CoverFixtureOptions; label: string }[] = [
  { key: "dropName", label: "학생명 빼기" },
  { key: "dropGrade", label: "학년 빼기" },
  { key: "dropDate", label: "날짜 빼기" },
  { key: "longName", label: "긴 이름" },
  { key: "longTitle", label: "긴 제목" },
];

// flow 표지는 화면에서 숨김(print 전용)이라 데모 미리보기에서만 보이게 덮는다.
// a4 시트는 report-responsive.css 가 화면 폭으로 축소하므로 배율을 1로 고정해
// 겹침 이미지와 맞춘다.
const DEMO_PREVIEW_CSS = `
  @media screen {
    .rcd-stage .fd-report-cover-flow { display: block !important; }
    .rcd-stage .fd-report-sheet { --fd-sheet-scale: 1; }
  }
`;

export default function ReportCoverDemo() {
  const [kind, setKind] = useState<ReportCoverKind>("diagnosis");
  const [variant, setVariant] = useState<ReportCoverPageVariant>("flow");
  const [flowPrintMode, setFlowPrintMode] =
    useState<ReportCoverFlowPrintMode>("fit");
  const [withDummyBody, setWithDummyBody] = useState(false);
  const [scale, setScale] = useState<(typeof SCALES)[number]>(100);
  const [options, setOptions] = useState<CoverFixtureOptions>({
    dropName: false,
    dropGrade: false,
    dropDate: false,
    longName: false,
    longTitle: false,
  });
  const { title, infoItems } = buildCoverFixture(kind, options);
  const { contentRef, save, isPreparing } =
    useReportPdfSave("report-cover-demo");
  const isA4 = variant === "a4";

  return (
    <div className="flex min-h-screen gap-4 bg-neutral-100 p-4 text-sm">
      <style>{DEMO_PREVIEW_CSS}</style>
      <aside className="flex w-64 shrink-0 flex-col gap-2">
        <label className="flex flex-col">
          종류
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ReportCoverKind)}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          방식
          <select
            value={variant}
            onChange={(e) =>
              setVariant(e.target.value as ReportCoverPageVariant)
            }
          >
            <option value="flow">flow</option>
            <option value="a4">a4</option>
          </select>
        </label>
        <label className="flex flex-col">
          flow 인쇄 방식
          <select
            value={flowPrintMode}
            disabled={isA4}
            onChange={(e) =>
              setFlowPrintMode(e.target.value as ReportCoverFlowPrintMode)
            }
          >
            <option value="fit">fit</option>
            <option value="fullBleed">fullBleed</option>
          </select>
        </label>
        {OPTION_TOGGLES.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={options[key]}
              onChange={(e) =>
                setOptions((prev) => ({ ...prev, [key]: e.target.checked }))
              }
            />
            {label}
          </label>
        ))}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={withDummyBody}
            onChange={(e) => setWithDummyBody(e.target.checked)}
          />
          표지 뒤 더미 본문 1장
        </label>
        <label className="flex flex-col">
          미리보기 배율
          <select
            value={scale}
            onChange={(e) =>
              setScale(Number(e.target.value) as (typeof SCALES)[number])
            }
          >
            {SCALES.map((value) => (
              <option key={value} value={value}>
                {value}%
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded border border-neutral-400 bg-white px-2 py-1"
          disabled={isPreparing}
          onClick={save}
        >
          PDF 저장
        </button>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto">
        <div
          data-testid="cover-preview"
          className="rcd-stage relative"
          style={{ width: isA4 ? "70rem" : "50rem", zoom: scale / 100 }}
        >
          <div
            ref={contentRef}
            data-testid="print-root"
            className={isA4 ? "fd-sheet-stack flex flex-col items-center" : ""}
          >
            <ReportCoverPage
              kind={kind}
              title={title}
              infoItems={infoItems}
              variant={variant}
              flowPrintMode={flowPrintMode}
            />
            {withDummyBody && (
              <section
                data-testid="dummy-body"
                className={
                  isA4
                    ? "fd-report-sheet h-[99rem] w-[70rem] bg-white"
                    : "h-[60rem] bg-white"
                }
              >
                더미 본문
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
