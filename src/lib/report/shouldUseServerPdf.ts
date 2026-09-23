// 모바일·인앱 브라우저 판별 — QA 2차 시트 행39·56(파일48 영상, 카카오톡 인앱·삼성
// 인터넷에서 리포트 PDF 다운로드 버튼이 무동작).
//
// window.print()는 카카오톡 인앱 웹뷰에서 무동작이고, 다운로드는 카카오 데브톡
// 공식 답변대로 서버 응답의 Content-Disposition: attachment로만 가능하다. 이
// 함수가 true를 반환하면 세 리포트 화면(학습진단·성장·수행평가)이 클라이언트
// 인쇄(window.print()/react-to-print) 대신 api/report-pdf.ts 서버 렌더 경로를 탄다.
// 데스크톱은 항상 false — 기존 인쇄 경로(벡터 품질, 기존 QA 통과분)를 그대로 둔다.
const IN_APP_BROWSER_RE =
  /KAKAOTALK|SamsungBrowser|NAVER\(inapp|Instagram|FBAN|FBAV|Line\//;
const MOBILE_OS_RE = /Android|iPhone|iPad|iPod/;

export function shouldUseServerPdf(userAgent: string): boolean {
  return IN_APP_BROWSER_RE.test(userAgent) || MOBILE_OS_RE.test(userAgent);
}
