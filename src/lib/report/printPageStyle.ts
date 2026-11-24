// react-to-print(iframe 격리) 공용 베이스 인쇄 스타일 — 수행평가 리포트 모달
// (`ReportModalShell.tsx`)에서 처음 확립된 규칙을 목표관리 성장 리포트 페이지(QA 행319,
// `GrowthReportBody.tsx`)가 이어받으며 공용으로 뽑았다. 두 화면이 공유하는 것은 딱 이
// 두 줄뿐이다 — `@page` 여백과 인쇄 시 배경색 보존(`print-color-adjust: exact`, 기본
// `useReactToPrint`의 기본 pageStyle을 이 문자열이 완전히 대체하므로 여기서 다시
// 선언해야 한다). 그 외(모달 크롬을 문서 흐름으로 푸는 규칙, 페이지 안쪽 콘텐츠를
// 숨기는 규칙 등)는 호출부마다 다르므로 각자 이 문자열 뒤에 자기 규칙을 이어붙인다.
export const REPORT_PRINT_PAGE_BASE_STYLE = `
  @page { margin: 15mm; }
  @media print {
    body {
      color-adjust: exact;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    /* mm 는 rem 규칙의 의도된 예외다. 인쇄 가능 폭 = A4 210mm - 여백 15mm x 2. 표지는
       첫 쪽 여백 0(page :first) 이라 Chrome 이 문서를 210mm 로 배치하는 경우가 있어, 루트를 묶지 않으면
       2쪽 이후 내용이 오른쪽에서 잘린다. 표지(210mm)는 루트 밖으로 넘쳐도 첫 쪽에 다 들어간다. */
    body > * {
      max-width: 180mm;
    }
  }
`;
