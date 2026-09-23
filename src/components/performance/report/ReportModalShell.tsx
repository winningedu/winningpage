import type { ReactNode, RefObject } from "react";
import { useRef } from "react";
import { useReactToPrint } from "react-to-print";
import ReportCoverPage from "@/components/report/ReportCoverPage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { REPORT_PRINT_PAGE_BASE_STYLE } from "@/lib/report/printPageStyle";

// 대형 리포트 모달의 **껍데기** — docs/수행평가-상세-명세.md §5.13(`3754:4722` 설계 리포트) /
// §5.16(`3754:4512` 평가 리포트) 공통.
//
// ── 왜 공유 껍데기인가 (판단이 아니라 명세 실측이다)
// §7.3 표 L1456 「평가/설계 리포트 모달 (`4512`/`4722`) | 77.5rem(1240) | 좌 2.5rem(40) |
// 콘텐츠 70.5rem(1128) | 우 4.5rem(72) | 스크롤바 @1645, 우변에서 6px」 — 두 노드가
// **한 행으로 묶여 같은 수치**를 갖는다. 헤더 타이포·구분선, 본문 섹션 gap, 푸터
// 1240×80·우측 정렬 버튼 2개, 딤 `#00000066`도 §5.13/§5.16 실측이 서로 같다.
// 다른 것은 ⓐ 헤더 문구 ⓑ 본문 내용 ⓒ 푸터 버튼 2개뿐이라 그 셋만 prop으로 받는다.
//
// **이 파일은 P10 `DesignReportModal`에서 껍데기를 그대로 들어올린 것이다**(치수 관례는
// 그쪽이 확립했다).
//
// ── shadcn `Dialog`(Base UI) 조합으로 종속 (2026-09, 사용자 결정)
// 예전에는 `@base-ui/react/dialog`를 직접 import해 `Dialog.Root`/`Portal`/`Backdrop`/`Popup`을
// 이 파일에서 조립했다(이유: `ui/dialog.tsx`의 `DialogContent`/`DialogOverlay`가 이 셸의
// 치수·딤 색을 바꿔 낄 훅이 없다는 판단). 지금은 그 판단을 뒤집는다 — `DialogContent`는
// `className`을 `cn()`(tailwind-merge)으로 병합하므로 충돌하는 기본값(폭·패딩·배경·라운드)은
// 전부 호출부 `className`이 이긴다. 커스텀 라운드 토큰(`rounded-perf-modal`)만 tailwind-merge
// 기본 스캔이 모르는 키라 `src/lib/utils.ts`의 `APP_RADIUS_SCALE`에 등록해 충돌 인식을 보강했다
// (기존 `APP_TEXT_SCALE`과 같은 이유 — "MessageHeader 12px 사고"). 오버레이 색(`performance-dim`,
// 블러 없음)은 `DialogContent`에 새로 추가한 `overlayClassName`으로 전달한다.
// ESC 닫기·Tab focus trap·배경 스크롤 잠금·포커스 이동/복귀·딤 클릭 닫기는 여전히 Base UI
// `Dialog.Root`(`modal` 기본값 `true`)가 대신한다 — 이 셸이 직접 구현하는 동작은 없다.
//
// ── 인쇄는 react-to-print(iframe 격리)로 전환
// 기존 `#root { display: none }` 트릭(포털 + 크롬 전용 `@media print`)을 버리고, 헤더+본문을
// 감싼 `contentRef`만 별도 iframe에 복제해 인쇄한다. 딤·푸터·앱 셸은 애초에 `contentRef`
// 밖이라 자연히 인쇄에서 빠진다(`performance-print-hide` 클래스가 필요 없어졌다). 본문 색
// 정규화·페이지 넘김 회피는 여전히 `PerformanceReportSurface`가 소유한다 — 그 컴포넌트의
// 인라인 `<style>`도 살아있는 DOM 노드라 react-to-print가 문서 스타일시트를 복사할 때 함께
// 딸려 간다. 이 파일이 소유하는 것은 `@page` 여백 + 고정 높이/내부 스크롤을 문서 흐름으로
// 푸는 규칙(`PRINT_PAGE_STYLE`)뿐이다.
//
// ── 호출부 계약
//   · `open`은 **이미 파생된 값**을 넘긴다(예: `open && Boolean(report)`).
//   · `documentTitle`은 PDF/인쇄 파일명이다(QA 행354). 생략하면 react-to-print가 인쇄
//     iframe의 `document.title`을 기본값으로 쓰는데, 그 iframe은 앱 전체를 복제하지
//     않아 사이트 기본 타이틀("위닝에듀")로 저장된다 — 두 리포트 모달 모두 반드시
//     넘긴다(`reportFileName.ts`의 `buildPerformanceReportFileName`).
//   · `footer`는 `ReactNode` 또는 `(ctx) => ReactNode` 함수형을 받는다 — 함수형이면
//     `ctx.print`로 react-to-print 핸들러를 받아 인쇄 버튼에 연결한다(`window.print()` 직접
//     호출 금지 — react-to-print의 iframe 격리를 우회하게 된다).
//   · 모달을 **자동으로** 여는 호출부가 닫힐 때 포커스를 트리거가 아닌 다른 곳으로 보내야
//     하면 `finalFocus`로 목적지를 지정한다(Base UI `Dialog.Popup`의 같은 이름 prop 그대로
//     전달한다 — 지정하지 않으면 열리기 전 포커스였던 요소로 자동 복귀한다).
type ReportModalShellFooterContext = {
  /** react-to-print 핸들러. 함수형 `footer`에서 인쇄 버튼 `onClick`에 그대로 연결한다. */
  print: () => void;
};

type ReportModalShellProps = {
  /** 이미 파생된 열림 여부. */
  open: boolean;
  /** 헤더 제목(`<h2>`, 다이얼로그 접근 이름 — Base UI가 `DialogTitle`을 `Popup`에 자동 배선). */
  title: string;
  /** 헤더 부제. 없으면 줄을 통째로 뺀다(빈 자리를 지어내지 않는다). */
  subtitle?: string;
  /** PDF/인쇄 파일명(QA 행354, `reportFileName.ts`). 없으면 react-to-print 기본값(빈
   * iframe의 `document.title`, 사실상 사이트 기본값)으로 떨어진다. */
  documentTitle?: string;
  /** 스크롤 영역의 `aria-label`. */
  scrollLabel: string;
  /** 로그인 학생 이름(QA 2차 시트 행37·51 표지). 없으면 표지에서 그 줄이 빠진다
   * (호출부 DesignReportModal/EvaluationReportModal이 이미 받는 studentName을
   * 그대로 넘긴다). */
  studentName?: string | null;
  /** 본문(폭 70.5rem 래퍼 안에 들어간다). */
  children: ReactNode;
  /** 푸터 우측 정렬 버튼 그룹. 함수형이면 `ctx.print`를 받는다. */
  footer?: ReactNode | ((ctx: ReportModalShellFooterContext) => ReactNode);
  /** ESC·딤 클릭 공통 핸들러(푸터 닫기 버튼도 호출부가 여기로 묶는다). */
  onClose: () => void;
  /** 닫힘 시 포커스 목적지. 자동으로 여는 호출부가 트리거를 특정할 수 없을 때만 넘긴다. */
  finalFocus?: RefObject<HTMLElement | null>;
};

export default function ReportModalShell({
  open,
  title,
  subtitle,
  documentTitle,
  scrollLabel,
  studentName,
  children,
  footer,
  onClose,
  finalFocus,
}: ReportModalShellProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const print = useReactToPrint({
    contentRef,
    pageStyle: PRINT_PAGE_STYLE,
    ...(documentTitle ? { documentTitle } : {}),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      {/* X 버튼은 §5.11·§5.13·§5.16 어느 시안에도 없으므로 애초에 배선하지 않는다
          (`showCloseButton={false}`). 딤 — `#00000066`(검정 40%, §5.13/§5.16 실측 =
          `performance-dim` 토큰, 블러 없음). 닫기는 Base UI의 outside-press 기본 동작이
          처리한다(수동 onClick 불필요). Base UI Popup은 `role="dialog"`는 자동으로
          배선하지만 `aria-modal`은 붙이지 않는다(전수 검색 0건 — 의도적 생략으로 보인다).
          이 셸은 항상 모달로만 쓰이므로 리터럴로 보강한다. */}
      <DialogContent
        showCloseButton={false}
        aria-modal="true"
        {...(finalFocus !== undefined ? { finalFocus } : {})}
        overlayClassName="z-100 bg-performance-dim supports-backdrop-filter:backdrop-blur-none"
        // 높이 46.9375rem(751px, §5.13/§5.16/§7.3 정본) + `max-h-[90vh]` 병기. `max-h`만 두면
        // 섹션 길이에 따라 모달 높이가 출렁이고 내부 스크롤을 전제한 751px 고정값이
        // 무의미해진다(P9 `TopicDetailModal`에서 확립된 규칙).
        // 폭 77.5rem(1240) — `max-w-`로 좁은 뷰포트에서는 `calc(100%-2rem)`만 남기고
        // 줄어든다(기존 오버레이 `p-4`와 동일한 1rem씩의 여백). 가로 스크롤은 생기지 않는다.
        // `sm:max-w-310`은 `DialogContent` 기본값의 `sm:max-w-sm`을 지우기 위한 중복 지정이다
        // (tailwind-merge는 변형 접두사가 다르면 별개 슬롯으로 보므로 접두사 없는 값만 줘서는
        // `sm:` 규칙이 안 지워진다).
        className="fixed top-1/2 left-1/2 z-100 flex h-187.75 max-h-[90vh] w-[calc(100%-2rem)] max-w-310 sm:max-w-310 -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden rounded-perf-modal bg-white p-0 text-base text-ink ring-0 shadow-[0_24px_60px_rgba(0,0,0,0.24)] outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
      >
        {/* 인쇄 대상 — 헤더+본문만 감싼다. 딤·푸터·앱 셸은 이 wrapper 밖이라 인쇄에서 자연히
            빠진다. `display: contents`라 패널의 flex 레이아웃(헤더/본문/푸터 순서)에는
            영향을 주지 않는다. */}
        <div ref={contentRef} className="contents">
          {/* 표지(QA 2차 시트 행37·51) — 인쇄 전용, 화면 모달에는 보이지 않는다(팀장
              지시 "print:block hidden 류"). variant="flow"의 인쇄 전용 규칙이 한
              페이지를 채우고 break-after:page로 본문(헤더+스크롤 영역)을 다음
              페이지에서 시작시킨다. 이 도메인(수행평가)엔 "목표 대학/학과" 개념이
              없어 targetMajor/targetUniversity는 넘기지 않는다. */}
          <div className="hidden print:block">
            <ReportCoverPage
              serviceLabel="수행평가"
              title={title}
              {...(studentName ? { studentName } : {})}
            />
          </div>

          {/* 헤더 — §5.13/§5.16 실측: 패널 상단에서 2.5rem 내려 시작, 세로 gap 0.25rem,
              아래 구분선까지 1.1875rem. 좌 인셋은 본문과 같은 2.5rem(넓은 뷰포트 기준,
              좁은 화면은 1.25rem으로 줄인다). 구분선 폭이 모달보다 11px 넓은 것은 시안
              오차라(§13 오류 표 「헤더 구분선 폭 1251」) 따르지 않는다. */}
          <DialogHeader className="performance-report-head shrink-0 gap-1 border-b border-performance-line px-5 pb-4.75 pt-10 xl:px-10">
            <DialogTitle className="wrap-break-word text-app-section font-semibold leading-6.5 text-ink">
              {title}
            </DialogTitle>
            {subtitle ? (
              <DialogDescription className="wrap-break-word text-app-card-title font-medium leading-5.25 text-ink-sub">
                {subtitle}
              </DialogDescription>
            ) : null}
          </DialogHeader>

          {/* 본문 — 폭 70.5rem이 정본(§7.3), 인셋 좌 2.5rem / 우 4.5rem 비대칭(콘텐츠 우변 →
              모달 우변 실측이라 좌우를 맞바꾸지 말 것). 2.5 + 70.5 + 4.5 = 77.5rem으로 모달
              폭과 정확히 맞는다.
              ⚠ 시안의 72px은 스크롤바를 그린 상태의 실측이지만, 여기서는 **스크롤바를 이 padding
              안에 접어 넣지 않고 그 바깥의 별도 거터로 본다** — 즉 72px은 콘텐츠 우변에서
              스크롤바까지의 거리다. 그 결과 클래식 스크롤바 플랫폼(Windows/Linux Chrome, 약 15px)
              에서는 실제 콘텐츠 폭이 70.5rem에서 스크롤바 폭만큼 줄고, 오버레이 스크롤바(macOS)
              에서는 정확히 70.5rem이 된다. 반대로 두면(padding에서 스크롤바 폭을 빼면) 플랫폼에
              따라 우측 인셋이 57px까지 좁아져 시안 실측과 눈에 띄게 어긋나고, CSS는 스크롤바
              실폭을 읽을 수 없어 두 값을 동시에 만족시킬 방법이 없다.
              비대칭 인셋은 모달이 온전히 들어가는 뷰포트(xl≥1280px, 1240+패딩)에서만 적용하고
              그 아래에서는 좌우 1.25rem 대칭으로 떨어뜨린다 — 좁은 화면에서 우측 4.5rem을
              유지하면 본문이 과하게 눌린다.
              포커서블 요소가 없는 스크롤 컨테이너는 Tab으로 도달할 수 없으므로 `tabIndex`를
              준다(ARIA APG "Scrollable Regions"). 이름 없는 generic div가 포커스 스톱이 되면
              낭독이 무음이라 `aria-label`을 준다(접근 이름이 있는 `<section>`은 암묵적으로
              region 역할을 가진다 — HTML-ARIA 매핑).
              오버레이 스크롤바 전환(2026-09): 원래 이 `<section>` 자신이 스크롤 요소였다.
              ScrollArea로 바뀌며 실제로 스크롤하는 노드는 내부 뷰포트(별도 div)로 옮겨가,
              tabIndex·aria-label(그리고 이제 없어진 암묵 region 역할 대신 명시 role="region")도
              함께 옮긴다 — `viewportProps`가 그 자리. `className`도 `viewportProps`로 넘긴다:
              `.performance-report-scroll`을 셀렉터로 쓰는 인쇄 CSS(PRINT_PAGE_STYLE)와
              `:focus-visible` 링은 "진짜 스크롤하는 노드"에 있어야 의미가 있다.
              ⚠️ 본문 인셋(`px-5 py-10 xl:pl-10 xl:pr-18`)은 뷰포트가 아니라 그 안의
              `.performance-report-body` 래퍼가 가진다 — OverlayScrollbars가 뷰포트에 인라인
              `padding: 0px`를 강제해 뷰포트 클래스의 패딩은 무효가 된다(2026-09-06 실측:
              본문이 패널 가장자리에 붙던 원인). 이 래퍼가 셸의 유일한 인셋 소유자이고
              `SectionedReportView`/`PerformanceReportSurface`는 좌우 패딩을 갖지 않는다. */}
          <ScrollArea
            className="min-h-0 flex-1"
            // defer={false} — viewportProps(tabIndex/aria-label/role)는 뷰포트가 실제로
            // 생기는 시점(초기화 완료)에야 적용된다. 기본 defer(true, 유휴/다음 프레임까지
            // 지연)를 쓰면 모달이 열린 직후 한동안 스크린리더가 이 영역을 이름 없는 채로
            // 읽거나 Tab 포커스가 닿지 않는 창이 생긴다 — 접근성 속성이라 지연을 허용하지
            // 않는다(EvaluationReportModal.test.tsx의 role=region 계약 실측으로도 확인).
            defer={false}
            viewportProps={{
              tabIndex: 0,
              "aria-label": scrollLabel,
              role: "region",
              className:
                "performance-report-scroll focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
            }}
          >
            <div className="performance-report-body max-w-282 px-5 py-10 xl:pl-10 xl:pr-18">
              {children}
            </div>
          </ScrollArea>
        </div>

        {/* 푸터 — 높이 5rem, 흰 배경, 버튼 우측 정렬 그룹 33.25rem(16.25 + 0.75 + 16.25) ×
            3.25rem(§5.13/§5.16 실측). 상단 구분선은 시안 실측에 없으나 본문이 그 아래로
            스크롤해 들어가므로 경계 표시로 둔다(§5.11 푸터와 같은 처리 — 의도적 추가).
            좌우 인셋은 헤더·본문과 같은 2.5rem으로 근사한다(푸터는 스크롤바가 없어 정확한
            우측 인셋 실측치가 명세에 없다). `contentRef` 밖이라 인쇄에서 자연히 빠진다. */}
        {footer ? (
          <DialogFooter className="mx-0 mb-0 flex h-20 shrink-0 flex-row items-center justify-end gap-3 rounded-b-perf-modal border-t border-performance-line bg-white p-0 px-5 xl:px-10">
            {typeof footer === "function" ? footer({ print }) : footer}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// 고정 높이/내부 스크롤 → 문서 흐름 전환. react-to-print가 문서의 다른 스타일시트
// (Tailwind 빌드 산출물 + `PerformanceReportSurface`의 인라인 `<style>`)를 그대로 iframe에
// 복사하므로, 여기서는 그 규칙들이 못 미치는 크롬 쪽 나머지만 채운다. `@page` 여백 +
// 색 정규화 베이스는 `REPORT_PRINT_PAGE_BASE_STYLE`(공용, `src/lib/report/printPageStyle.ts`)
// 이 두 화면(이 모달 + 목표관리 성장 리포트)을 위해 갖고, 이 상수는 그 뒤에 모달
// 크롬 전용 규칙만 이어붙인다.
export const PRINT_PAGE_STYLE = `
  ${REPORT_PRINT_PAGE_BASE_STYLE}
  /* 인셋은 @page 여백(15mm)이 대신한다. **헤더와 본문을 같이 걷는다** — 본문만 0으로
     만들면 제목·부제만 좌측으로 들여쓰인 채 남아 좌측 정렬이 어긋난다. */
  .performance-report-head,
  .performance-report-body {
    padding: 0 !important;
  }
  /* 고정 높이 + 내부 스크롤 → 문서 흐름. 이 전환이 없으면 첫 화면분만 인쇄된다. */
  .performance-report-scroll {
    overflow: visible !important;
    max-height: none !important;
    height: auto !important;
    flex: none !important;
  }
  .performance-report-scroll > * { max-width: none !important; }
`;

/**
 * 푸터 버튼 2종. §5.13/§5.16 실측이 같다 — 16.25rem×3.25rem r0.75rem, secondary는 stroke
 * `#d9d9d9` + 1rem w500 `ink-sub`, primary는 `fill #013262`(§11.1 Q5 결정) + 1rem w600 흰색.
 *
 * `shrink-0`을 두지 않는다 — 필요 폭 33.25rem(532px)이 가용 폭을 넘는 좁은 뷰포트
 * (vw < 604px)에서 축소가 막히면 `justify-end` 때문에 넘치는 분량이 좌측으로 밀리고 패널의
 * `overflow-hidden`이 그것을 잘라낸다. 하필 잘리는 쪽이 유일한 명시적 닫기 버튼(secondary)이다.
 * 축소를 허용하면 두 버튼이 같이 줄고 라벨은 3.25rem 높이 안에서 두 줄로 접힌다
 * (1.25rem 줄높이 × 2 < 3.25rem). `min-w-0`은 플렉스 아이템의 기본 `min-width: auto`가
 * 축소를 다시 막는 것을 푼다.
 */
export const REPORT_MODAL_FOOTER_BUTTON = {
  secondary:
    "flex h-13 w-65 min-w-0 max-w-full items-center justify-center rounded-xl border border-performance-line px-2 text-center text-app-card-title font-medium leading-5 text-ink-sub transition hover:bg-performance-bubble active:scale-[0.97] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100",
  primary:
    "flex h-13 w-65 min-w-0 max-w-full items-center justify-center rounded-xl bg-primary px-2 text-center text-app-card-title font-semibold leading-5 text-white transition hover:bg-primary/90 active:scale-[0.97] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:bg-performance-line disabled:hover:bg-performance-line disabled:active:scale-100",
};
