// W7 이용현황이 쓰는 서비스 이름, 비율 계산, 표기 규칙.

import type { GradeLabeler } from "../classLabel";

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

export interface Totals {
  total: number;
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
  let joined = 0;
  let capTotal = 0;
  let capSum = 0;
  for (const r of rows) {
    total += r.total;
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
