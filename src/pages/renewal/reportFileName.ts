import { site } from "@/config/site";
import { ymdIn } from "@/lib/time/day";
import { browserTimeZone } from "@/lib/time/zone";

// 학습진단 리포트 PDF 파일명(QA 시트 2026-08-22).
//
// 요구 형식: "위닝에듀 학습진단리포트_OOO학생_년월일.PDF"
//   - 브라우저 "PDF로 저장"은 document.title 을 기본 파일명으로 쓰므로 여기서 만드는 문자열이
//     확장자를 제외한 파일명 전체다(확장자 .pdf 는 브라우저가 붙인다 — 대소문자는 브라우저 소관).
//   - 날짜는 리포트의 "진단 완료일"(data.student.diagnosedAt, 서버가 회원 시간대로 정한 날짜)를
//     YYYYMMDD 로 쓴다. 다운로드한 날이 아니라 진단한 날이 문서의 정체성이다.
//   - 이름/날짜를 못 구하면 그 조각만 빼고 잇는다 — 가짜 이름·오늘 날짜로 메우지 않는다.
//
// 종전 형식 "{이름}_위닝학습진단리포트"(QA 행 103, 2026-08-20)를 이 형식으로 교체했다.

const REPORT_FILE_PREFIX = `${site.brandName} 학습진단리포트`;

// 진단일(서버가 회원 시간대로 정한 YYYY-MM-DD)은 변환 없이 쓴다. 시각이 붙은 값(옛 저장분)만
// 지정한 시간대, 없으면 브라우저 시간대의 날짜로 바꾼다.
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function toYmd(iso: string | null | undefined, timeZone: string) {
  if (!iso) return null;
  if (YMD_RE.test(iso)) return iso.replaceAll("-", "");
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return ymdIn(date, timeZone).replaceAll("-", "");
}

export function buildReportFileName(input: {
  studentName?: string | null;
  diagnosedAt?: string | null;
  timeZone?: string;
}) {
  const name = String(input.studentName ?? "").trim();
  const ymd = toYmd(input.diagnosedAt, input.timeZone ?? browserTimeZone());

  const parts = [REPORT_FILE_PREFIX];
  if (name) parts.push(`${name}학생`);
  if (ymd) parts.push(ymd);
  return parts.join("_");
}
