// W7 엑셀 출력 표(교 #40). 제목, 조회 조건, 서비스별 이용 인원, 반별 표와 합계 행만 담고 학생 이름은 담지 않는다.

import { dotDate } from "../date";
import {
  type ClassRow,
  gradeGroupLabel,
  percent,
  SERVICES,
  totalsOf,
} from "./format";

type Cell = string | number;

// 엑셀이 수식으로 읽는 첫 글자(= + - @ 탭 줄바꿈)는 글자로 보이게 작은따옴표를 앞에 붙인다.
const FORMULA_START = /^[=+\-@\t\r]/;
const safe = (text: string) => (FORMULA_START.test(text) ? `'${text}` : text);

const countWithRate = (count: number, total: number) =>
  `${count}명 (${percent(count, total)}%)`;

export function buildEnrollmentGrid(input: {
  rows: ClassRow[];
  filter: { grade: string; class: string };
  asOf: string;
  scopeLabel: string;
}): Cell[][] {
  const { rows, filter, asOf, scopeLabel } = input;
  const totals = totalsOf(rows);
  const capacitySum = rows.reduce((sum, r) => sum + (r.capacity ?? 0), 0);

  return [
    ["이용현황"],
    ["조회 조건", filter.grade, filter.class],
    ["집계 기준", `${scopeLabel}, ${dotDate(asOf)} 기준`],
    [],
    ["서비스별 이용", ...SERVICES.map((s) => s.label)],
    [
      "이용 인원(이용률)",
      ...SERVICES.map((s) =>
        countWithRate(totals.services[s.key], totals.total),
      ),
    ],
    [],
    [
      "담임",
      "학년그룹",
      "반",
      "총원",
      "정원",
      "이용 학생",
      ...SERVICES.map((s) => s.label),
      "목표 실행률 평균",
    ],
    ...rows.map((r) => [
      safe(r.homeroomName ?? "담임 미배정"),
      safe(gradeGroupLabel(r)),
      safe(`${r.className}반`),
      r.total,
      r.capacity ?? "",
      r.joined,
      ...SERVICES.map((s) => countWithRate(r.services[s.key], r.total)),
      r.goalRateAvg === null ? "" : `${r.goalRateAvg}%`,
    ]),
    [
      "합계",
      "",
      "",
      totals.total,
      totals.capacityRate ? capacitySum : "",
      totals.joined,
      ...SERVICES.map((s) =>
        countWithRate(totals.services[s.key], totals.total),
      ),
      "",
    ],
  ];
}

/** 스쿨멘토_이용현황_날짜(교 #40). 날짜는 집계 기준일이다. */
export const enrollmentFileName = (asOf: string) =>
  `스쿨멘토_이용현황_${asOf.replaceAll("-", "")}.xlsx`;

/** 표를 엑셀로 내려받는다. 콘솔 첫 묶음에 들어가지 않도록 내려받을 때만 xlsx 를 불러온다. */
export async function downloadEnrollmentXlsx(
  grid: Cell[][],
  asOf: string,
): Promise<void> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(grid),
    "이용현황",
  );
  XLSX.writeFile(workbook, enrollmentFileName(asOf));
}
