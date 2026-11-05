// W14와 W16이 함께 쓰는 교사 목록 응답 모양과 표시 규칙.

import { gradeLabel } from "../classLabel";

export type AccountStatus = "active" | "inactive" | "unissued";

export interface RosterRow {
  classId: string | null;
  grade: string | null;
  groupName: string | null;
  className: string | null;
  activeStudents: number;
  teacher: { id: string; name: string } | null;
  loginId: string | null;
  accountStatus: AccountStatus | null;
  classCount: number;
}

export interface TeacherSummary {
  id: string;
  name: string;
  role: "homeroom" | "school_admin";
  status: "active" | "inactive";
  hasAccount: boolean;
  activeStudents: number;
  classes: {
    grade: string;
    groupId: string | null;
    groupName: string | null;
    name: string;
  }[];
}

/** 학년 칸. 그룹이 있으면 "1학년-A레벨" 로 같이 적는다(학원, 결정 4). */
export function gradeGroupLabel(
  grade: string | null,
  groupName: string | null,
): string {
  if (!grade) return "-";
  return groupName ? `${gradeLabel(grade)}-${groupName}` : gradeLabel(grade);
}

/** 담당 학급 표기. "2학년 3반" 또는 "1학년-A레벨 2반". */
export function classText(c: {
  grade: string;
  groupName: string | null;
  name: string;
}): string {
  return `${gradeGroupLabel(c.grade, c.groupName)} ${c.name}반`;
}

/** W16 계정 목록 한 줄(GET /api/console/teachers/accounts). */
export interface AccountItem {
  id: string;
  name: string;
  role: "homeroom" | "school_admin";
  phoneLast4: string;
  /** Auth 의 마지막 로그인 시각(ISO). 없거나 읽지 못하면 null. */
  lastLoginAt: string | null;
  loginId: string;
  status: "active" | "inactive";
  passwordSet: boolean;
  classes: {
    id: string;
    grade: string;
    groupId: string | null;
    groupName: string | null;
    name: string;
    isPrimary: boolean;
    activeStudents: number;
  }[];
}

/** 최근 로그인 표기 "11/03 08:15"(기기의 시간대). 값이 없으면 "-". */
export function lastLoginText(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getMonth() + 1)}/${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}
