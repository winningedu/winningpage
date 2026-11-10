import { site } from "@/config/site";

// 학습진단 리포트 PDF 파일명(QA 시트 2026-08-22).
//
// 요구 형식: "위닝에듀 학습진단리포트_OOO학생_년월일.PDF"
//   - 브라우저 "PDF로 저장"은 document.title 을 기본 파일명으로 쓰므로 여기서 만드는 문자열이
//     확장자를 제외한 파일명 전체다(확장자 .pdf 는 브라우저가 붙인다 — 대소문자는 브라우저 소관).
//   - 날짜는 리포트의 "진단 완료일"(data.student.diagnosedAt, 설문 제출 시각 ISO)을 KST 기준
//     YYYYMMDD 로 쓴다. 다운로드한 날이 아니라 진단한 날이 문서의 정체성이다.
//   - 이름/날짜를 못 구하면 그 조각만 빼고 잇는다 — 가짜 이름·오늘 날짜로 메우지 않는다.
//
// 종전 형식 "{이름}_위닝학습진단리포트"(QA 행 103, 2026-08-20)를 이 형식으로 교체했다.

const REPORT_FILE_PREFIX = `${site.brandName} 학습진단리포트`;

function toKstYmd(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  // sv-SE 로케일은 YYYY-MM-DD 로 찍는다(src/lib/goal/calc/virtualDate.ts kstYMD 와 같은 관례).
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replaceAll("-", "");
}

export function buildReportFileName(input: {
  studentName?: string | null;
  diagnosedAt?: string | null;
}) {
  const name = String(input.studentName ?? "").trim();
  const ymd = toKstYmd(input.diagnosedAt);

  const parts = [REPORT_FILE_PREFIX];
  if (name) parts.push(`${name}학생`);
  if (ymd) parts.push(ymd);
  return parts.join("_");
}
