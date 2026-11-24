// 본사 대시보드 기관 현황(계획 4번 A1, A2, A3, A4, A6). 수치는 DB 함수 fn_hq_tenant_overview 와
// fn_hq_tenant_students 가 정본이고(Q9 학생 수 규칙, 기본 제외 Q3), 목표 실행률은 콘솔과 같은 goalRate.ts 계산을 쓴다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { loadGoalStatus } from "../console/goalStatus.js";
import { fetchAllRows } from "../console/paging.js";

export type ContractStatus =
  | "trial"
  | "none"
  | "upcoming"
  | "active"
  | "ending_soon"
  | "grace"
  | "expired";

export interface TenantOverviewRow {
  tenantId: string;
  name: string;
  region: string;
  orgType: string;
  contractStartDate: string | null;
  contractEndDate: string | null;
  graceEnd: string | null;
  trialStartDate: string | null;
  trialEndDate: string | null;
  /** trial 은 시범기간 안이고 계약 기간(active, ending_soon) 밖인 기관(결정 117). */
  contractStatus: ContractStatus;
  studentCount: number;
  /** 학적이 없는 학생(위닝 옛 학생). 화면은 "학년, 반 미상"으로 보인다. */
  studentWithoutEnrollmentCount: number;
  teacherCount: number;
  /** 마지막 활동 순간(ISO). 센 회원의 last_seen_at 과 로그인 15분 칸 중 늦은 것. */
  lastActivityAt: string | null;
}

interface DbOverviewRow {
  tenant_id: string;
  name: string;
  region: string;
  org_type: string;
  contract_start_date: string | null;
  contract_end_date: string | null;
  grace_end: string | null;
  trial_start_date: string | null;
  trial_end_date: string | null;
  contract_status: ContractStatus;
  student_count: number;
  student_without_enrollment_count: number;
  teacher_count: number;
  last_activity_at: string | null;
}

/** 기관 현황 쿼리. includeInternal 은 "1"(포함) 또는 "0", 없으면 기본 제외. 그 밖의 값은 400. */
export const includeInternalQuery = z.object({
  includeInternal: z
    .enum(["0", "1"])
    .optional()
    .transform((value) => value === "1"),
});

/** PostgREST 는 timestamptz 를 +00:00 로 주므로 ISO Z 로 맞춘다. */
function toIsoZ(value: string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

export async function loadTenantOverview(
  admin: SupabaseClient,
  includeInternal: boolean,
): Promise<TenantOverviewRow[]> {
  const { data, error } = await admin.rpc("fn_hq_tenant_overview", {
    p_include_internal: includeInternal,
  });
  if (error || !data) throw new Error("tenant overview read failed");
  return (data as DbOverviewRow[]).map((row) => ({
    tenantId: row.tenant_id,
    name: row.name,
    region: row.region,
    orgType: row.org_type,
    contractStartDate: row.contract_start_date,
    contractEndDate: row.contract_end_date,
    graceEnd: row.grace_end,
    trialStartDate: row.trial_start_date,
    trialEndDate: row.trial_end_date,
    contractStatus: row.contract_status,
    studentCount: row.student_count,
    studentWithoutEnrollmentCount: row.student_without_enrollment_count,
    teacherCount: row.teacher_count,
    lastActivityAt: toIsoZ(row.last_activity_at),
  }));
}

export interface TenantSummary {
  tenantCount: number;
  studentCount: number;
  studentWithoutEnrollmentCount: number;
  teacherCount: number;
  contracts: {
    trial: number;
    none: number;
    upcoming: number;
    active: number;
    endingSoon: number;
    grace: number;
    expired: number;
  };
}

const CONTRACT_KEYS: Record<ContractStatus, keyof TenantSummary["contracts"]> =
  {
    trial: "trial",
    none: "none",
    upcoming: "upcoming",
    active: "active",
    ending_soon: "endingSoon",
    grace: "grace",
    expired: "expired",
  };

export function summarizeTenants(rows: TenantOverviewRow[]): TenantSummary {
  const contracts = {
    trial: 0,
    none: 0,
    upcoming: 0,
    active: 0,
    endingSoon: 0,
    grace: 0,
    expired: 0,
  };
  let studentCount = 0;
  let studentWithoutEnrollmentCount = 0;
  let teacherCount = 0;
  for (const row of rows) {
    contracts[CONTRACT_KEYS[row.contractStatus]] += 1;
    studentCount += row.studentCount;
    studentWithoutEnrollmentCount += row.studentWithoutEnrollmentCount;
    teacherCount += row.teacherCount;
  }
  return {
    tenantCount: rows.length,
    studentCount,
    studentWithoutEnrollmentCount,
    teacherCount,
    contracts,
  };
}

export interface TenantGoal {
  /** 목표관리 학생의 주간 달성율 평균(반올림). 달성율이 있는 학생이 없으면 null. */
  average: number | null;
  /** 목표관리를 쓰는 학생 수(goal_students 행). */
  userCount: number;
}

const GOAL_CHUNK = 100;

/**
 * 기관별 목표 실행률 평균. 콘솔 대시보드(console/dashboard.ts)와 같은 계산이다: 학생별 weeklyRate 를
 * loadGoalStatus 로 구하고 null(목표 설정일 없음)은 뺀다(결정 62). 100명 묶음을 동시에 읽는다.
 */
export async function loadTenantGoals(
  admin: SupabaseClient,
  includeInternal: boolean,
): Promise<Map<string, TenantGoal>> {
  const students = await fetchAllRows<{
    tenant_id: string;
    profile_id: string;
  }>((from, to) =>
    admin
      .rpc("fn_hq_tenant_students", { p_include_internal: includeInternal })
      .order("tenant_id")
      .order("profile_id")
      .range(from, to),
  );
  const ids = [...new Set(students.map((s) => s.profile_id))];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += GOAL_CHUNK)
    chunks.push(ids.slice(i, i + GOAL_CHUNK));
  const statuses = await Promise.all(
    chunks.map((chunk) => loadGoalStatus(admin, chunk)),
  );
  const rateOf = new Map<string, number | null>();
  for (const status of statuses)
    for (const [id, goal] of status) rateOf.set(id, goal.weeklyRate);

  const byTenant = new Map<string, { rates: number[]; userCount: number }>();
  for (const s of students) {
    if (!rateOf.has(s.profile_id)) continue;
    const entry = byTenant.get(s.tenant_id) ?? { rates: [], userCount: 0 };
    entry.userCount += 1;
    const rate = rateOf.get(s.profile_id);
    if (rate !== null && rate !== undefined) entry.rates.push(rate);
    byTenant.set(s.tenant_id, entry);
  }
  const result = new Map<string, TenantGoal>();
  for (const [tenantId, { rates, userCount }] of byTenant) {
    result.set(tenantId, {
      average:
        rates.length > 0
          ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length)
          : null,
      userCount,
    });
  }
  return result;
}
