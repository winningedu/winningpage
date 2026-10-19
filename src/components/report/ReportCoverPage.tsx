// 리포트 공용 표지 - QA3 시트 행55, 56 (고객사 파일83 디자인). 리포트 7종이 이 컴포넌트
// 하나를 공유하고, 문구는 coverPresets 가, 정보 줄 값은 호출부가 정한다.
//
// 크기는 전부 컨테이너 쿼리 비율 단위(cqw)다. 표지 루트가 inline-size 컨테이너이고
// 파일83 폭 2382px = 100cqw 로 환산했다. 어떤 폭에서도 같은 비율로 그려진다.
// 색 상수는 표지 전용이라 이 파일 안에만 둔다.
//
// 값이 없는 정보 칸은 렌더하지 않는다(폴백 상수 금지). 전부 비면 정보 줄 자체가 빠진다.
//
// variant="a4" - 학습진단 전용. `fd-report-sheet` 클래스로 시트 스택에 놓이고(화면에도
// 보인다), `.fd-report-sheet + .fd-report-sheet` 규칙이 표지 다음 시트의 개행을 맡는다.
// report-print.css 의 `.fd-report-sheet` 인쇄 패딩이 비율 상자를 깨므로 아래 인쇄 규칙으로 덮는다.
//
// variant="flow"(기본) - react-to-print 문서 흐름 리포트 전용. 화면에서는 숨기고 인쇄에서만
// 한 페이지로 나온다. 고정 높이 250mm 이상이면 Chromium 이 박스를 두 페이지로 쪼개는
// 버그(QA t11 실측)가 있어, fit 은 230mm 높이 안에 A4 비율로 맞춘다.
import { site } from "@/config/site";
import { cn } from "@/lib/utils";
import { REPORT_COVER_PRESETS, type ReportCoverKind } from "./coverPresets";

export type ReportCoverPageVariant = "a4" | "flow";
export type ReportCoverFlowPrintMode = "fullBleed" | "fit";

export type ReportCoverInfoItem = {
  label: string;
  value: string | null | undefined;
};

export type ReportCoverPageProps = {
  kind: ReportCoverKind;
  /** 2줄 제목. 줄바꿈 문자로 두 줄을 나눈다. */
  title: string;
  infoItems: readonly ReportCoverInfoItem[];
  variant?: ReportCoverPageVariant;
  flowPrintMode?: ReportCoverFlowPrintMode;
  className?: string;
};

// 계단 6단 - 크림 판 하단에 붙고 좌에서 우로 높아진다. height 는 cqw.
const STEPS = [
  { label: "학습진단", bg: "#1d2a6b", fg: "#ffffff", height: 7.6 },
  { label: "목표관리", bg: "#4cd9a0", fg: "#0b2545", height: 10.65 },
  { label: "성장설계", bg: "#fdd443", fg: "#0b2545", height: 13.7 },
  { label: "수행평가", bg: "#ffa030", fg: "#0b2545", height: 16.75 },
  { label: "심화탐구", bg: "#ff6b4e", fg: "#ffffff", height: 19.8 },
  { label: "자기평가", bg: "#7b6cf0", fg: "#ffffff", height: 22.85 },
] as const;

const A4_SHEET_CLASS =
  "fd-report-sheet fd-report-cover-a4 w-full shrink-0 rounded-2xl shadow-[0_0_1.25rem_rgba(0,0,0,0.06)] lg:w-280";
const FLOW_SHEET_CLASS = "fd-report-cover-flow hidden print:block";

// a4: report-print.css 의 `.fd-report-sheet` 인쇄 규칙(패딩, overflow visible)보다 셀렉터를
// 한 단계 높여 덮는다. 폭 70rem 은 그 파일 값 그대로 쓴다.
const A4_PRINT_RULE = `
  @media print {
    .fd-report-sheet.fd-report-cover-a4 {
      padding: 0 !important;
      overflow: hidden !important;
    }
  }
`;

const FLOW_FIT_PRINT_RULE = `
  @media print {
    .fd-report-cover-flow {
      width: calc(230mm * 2382 / 3369);
      margin: 0 auto;
      break-after: page;
      page-break-after: always;
    }
  }
`;

const FLOW_FULL_BLEED_PRINT_RULE = `
  @page :first { margin: 0; }
  @media print {
    .fd-report-cover-flow {
      width: 210mm;
      height: 297mm;
      margin: 0;
      break-after: page;
      page-break-after: always;
    }
  }
`;

export default function ReportCoverPage({
  kind,
  title,
  infoItems,
  variant = "flow",
  flowPrintMode = "fit",
  className,
}: ReportCoverPageProps) {
  const preset = REPORT_COVER_PRESETS[kind];
  const isA4 = variant === "a4";
  const filledItems = infoItems.filter(({ value }) => value?.trim());
  const printRule = isA4
    ? A4_PRINT_RULE
    : flowPrintMode === "fullBleed"
      ? FLOW_FULL_BLEED_PRINT_RULE
      : FLOW_FIT_PRINT_RULE;

  return (
    <section
      aria-label={`${preset.serviceLabel} 리포트 표지`}
      className={cn(
        "relative aspect-[2382/3369] overflow-hidden bg-white break-keep [container-type:inline-size] print:[print-color-adjust:exact]",
        isA4 ? A4_SHEET_CLASS : FLOW_SHEET_CLASS,
        className,
      )}
    >
      <style>{printRule}</style>

      {/* 장식 원과 회전 사각형 */}
      <div
        aria-hidden="true"
        className="absolute left-[54%] aspect-square w-[66cqw] rounded-full bg-[#f1f5fa]"
        style={{ top: "calc(7% - 33cqw)" }}
      />
      <div
        aria-hidden="true"
        className="absolute left-[83.3%] top-[16%] size-[13.5cqw] -translate-x-1/2 -translate-y-1/2 rotate-20 rounded-[2.8cqw] bg-[#e3eaf3]"
      />

      <div className="absolute inset-x-[8.1%] top-[4.7%] flex h-[3.4cqw] items-center justify-between">
        <img
          src={site.logo.horizontal}
          alt={site.brandName}
          className="h-full w-auto"
        />
        <p className="text-[1.3cqw] uppercase tracking-[0.2em] text-[#7a8aa0]">
          {preset.englishLabel}
        </p>
      </div>

      <div className="absolute inset-x-[8.1%] top-[14.7%]">
        <p className="flex items-center gap-[1.3cqw] text-[1.7cqw] font-semibold leading-[2.6cqw] text-[#1e6fd9]">
          <span
            aria-hidden="true"
            className="h-[0.14cqw] w-[3cqw] bg-[#1e6fd9]"
          />
          {preset.serviceLabel}
        </p>
      </div>

      <h1 className="absolute inset-x-[8.1%] top-[18.3%] whitespace-pre-line text-[7cqw] font-extrabold leading-[1.2] tracking-[-0.03em] text-[#0b2545]">
        {title}
      </h1>

      <div className="absolute inset-x-[8.1%] top-[31.5%] text-[1.85cqw] leading-[1.65] text-[#5a6b82]">
        <p>{preset.subtitle[0]}</p>
        <p>{preset.subtitle[1]}</p>
      </div>

      {/* 남색 패널 - 좌측 항목 목록과 우측 크림 판의 계단 */}
      <div className="absolute inset-x-[8.1%] top-[40.2%] h-[22.1%] rounded-[3cqw] bg-[#0b2545]">
        <p className="absolute left-[4.2cqw] top-[3.3cqw] text-[1.3cqw] uppercase leading-[1.4cqw] tracking-[0.2em] text-[#8fb8f0]">
          {preset.areasHeading}
        </p>
        <ol className="absolute bottom-[2.5cqw] left-[4.2cqw]">
          {preset.areas.map((area, index) => (
            <li
              key={area}
              data-testid="cover-area"
              className="flex h-[3.75cqw] items-center gap-[1.4cqw]"
            >
              <span className="text-[1.6cqw] text-[#8fb8f0]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-[2cqw] font-bold text-white">{area}</span>
            </li>
          ))}
        </ol>

        <div className="absolute inset-y-[1.8cqw] left-[29.6cqw] right-[1.8cqw] overflow-hidden rounded-[2.2cqw] bg-[#f3efe7]">
          <ol className="absolute inset-x-[1.77cqw] bottom-0 flex items-end gap-[0.5cqw]">
            {STEPS.map((step, index) => (
              <li
                key={step.label}
                data-testid="cover-step"
                className="flex-1 rounded-t-[1.2cqw] px-[0.85cqw] pt-[1.1cqw] text-[1.4cqw] font-bold leading-[1.7cqw]"
                style={{
                  height: `${step.height}cqw`,
                  backgroundColor: step.bg,
                  color: step.fg,
                }}
              >
                <span className="block">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="block">{step.label}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {filledItems.length > 0 && (
        <div
          data-testid="cover-info"
          className="absolute inset-x-[8.1%] top-[78.3%] flex min-h-[7cqw] border-t-[0.14cqw] border-[#0b2545]"
        >
          {filledItems.map((item, index) => (
            <div
              key={item.label}
              className={cn(
                "min-w-0 flex-1 pt-[1.8cqw]",
                index > 0 && "border-l-[0.07cqw] border-[#e3eaf3] pl-[2.3cqw]",
              )}
            >
              <p className="text-[1.3cqw] leading-[2cqw] text-[#7a8aa0]">
                {item.label}
              </p>
              <p className="mt-[0.7cqw] text-[2.1cqw] font-bold leading-[3cqw] text-[#0b2545]">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="absolute inset-x-[8.1%] top-[92.8%] flex items-center justify-between gap-[2cqw] border-t-[0.07cqw] border-[#e3eaf3] pt-[2.2cqw]">
        <p className="min-w-0 text-[1.2cqw] leading-[2cqw] text-[#7a8aa0]">
          {preset.disclaimer}
        </p>
        <p className="shrink-0 whitespace-nowrap text-[1.4cqw] font-semibold leading-[2cqw] text-[#c47a3a]">
          {site.brandName} 학생 전용
        </p>
      </div>
    </section>
  );
}
