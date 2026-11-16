// W7 이용현황이 쓰는 서비스 이름, 비율 계산, 표기 규칙.

import { type GradeLabeler, MIXED_GRADE } from "../classLabel";
import { CONSOLE_BASE } from "../menu";

export const SERVICES = [
  { key: "diagnosis", label: "학습진단", bar: "bg-service-diagnosis-fg" },
  { key: "goal", label: "목표관리", bar: "bg-service-goal-fg" },
  { key: "growth", label: "성장설계", bar: "bg-service-growth-fg" },
  { key: "performance", label: "수행평가", bar: "bg-service-performance-fg" },
  {
    key: "selfeval",
    label: "자기평가",
    bar: "bg-service-self-assessment-fg",
  },
  { key: "inquiry", label: "심화탐구", bar: "bg-service-research-fg" },
] as const;

export type ServiceKey = (typeof SERVICES)[number]["key"];

export interface ClassRow {
  classId: string;
  grade: string | null;
  groupName: string | null;
  className: string;
  homeroomName: string | null;
  total: number;
  /** 명단만 올라온 가입 전(미가입) 학생 수. 총원에 들지 않는다. */
  pendingCount: number;
  capacity: number | null;
  joined: number;
  services: Record<ServiceKey, number>;
  goalRateAvg: number | null;
}

export interface EnrollmentSummary {
  asOf: string;
  orgType: string | null;
  classes: ClassRow[];
}

export const percent = (count: number, total: number) =>
  total > 0 ? Math.round((count / total) * 100) : 0;

/** "1학년", 그룹이 있으면 "1학년-A레벨"(교 #39). */
export function gradeGroupLabel(
  row: Pick<ClassRow, "grade" | "groupName">,
  gradeLabel: GradeLabeler,
) {
  return row.groupName
    ? `${gradeLabel(row.grade)}-${row.groupName}`
    : gradeLabel(row.grade);
}

/** 그 반 학생만 보이는 학생 목록 주소. 가입 전 학생은 전체 탭에만 나온다. */
export function studentListPath(row: Pick<ClassRow, "classId" | "grade">) {
  const params = new URLSearchParams({
    tab: "all",
    grade: row.grade ?? MIXED_GRADE,
    classId: row.classId,
  });
  return `${CONSOLE_BASE}/students?${params}`;
}

export interface Totals {
  total: number;
  /** 가입 전(미가입) 학생 수 합. */
  pending: number;
  joined: number;
  services: Record<ServiceKey, number>;
  /** 정원을 넣은 반의 총원과 정원 합. 넣은 반이 없으면 null. */
  capacityRate: { rate: number; excludedClassCount: number } | null;
}

/** 보이는 반들의 합계. 가입률은 정원을 넣은 반만 계산한다(사 #150). */
export function totalsOf(rows: ClassRow[]): Totals {
  const services = Object.fromEntries(
    SERVICES.map((s) => [s.key, 0]),
  ) as Record<ServiceKey, number>;
  let total = 0;
  let pending = 0;
  let joined = 0;
  let capTotal = 0;
  let capSum = 0;
  for (const r of rows) {
    total += r.total;
    pending += r.pendingCount;
    joined += r.joined;
    for (const s of SERVICES) services[s.key] += r.services[s.key];
    if (r.capacity !== null) {
      capTotal += r.total;
      capSum += r.capacity;
    }
  }
  const withCapacity = rows.filter((r) => r.capacity !== null).length;
  return {
    total,
    pending,
    joined,
    services,
    capacityRate:
      withCapacity === 0
        ? null
        : {
            rate: percent(capTotal, capSum),
            excludedClassCount: rows.length - withCapacity,
          },
  };
}
