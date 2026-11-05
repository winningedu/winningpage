// W6 표기. 학년그룹과 반은 "2학년 3반", 학원은 그룹을 학년 칸에 붙여 "1학년-A레벨 1반"(사이트 결정 4).

import { slotLabel } from "../student-history/format";
import type { StudentRow } from "./types";

export const gradeClassOf = (row: StudentRow, academy: boolean): string =>
  slotLabel({
    grade: row.grade,
    groupName: academy ? row.groupName : null,
    className: row.className,
    number: null,
  });

export const numberOf = (row: StudentRow): string =>
  row.number === null ? "번호 미입력" : `${row.number}번`;

/** 2026-03-02 를 2026.03.02 로. */
export const joinedLabel = (joinedAt: string | null): string =>
  joinedAt ? joinedAt.replaceAll("-", ".") : "";
