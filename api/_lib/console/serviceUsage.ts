// 학생이 쓴 서비스 6종. 서비스마다 그 학생의 기록이 하나라도 있으면 쓴 것으로 본다(W6 데이터 원본 규칙).
// 목표관리는 목표 설정, 성장설계는 프로필이나 리포트 중 하나가 있으면 쓴 것이다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "./directory.js";

export const SERVICE_KEYS = [
  "diagnosis",
  "goal",
  "growth",
  "performance",
  "selfeval",
  "inquiry",
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number];

// id 열이 없는 테이블은 profile_id 로 정렬한다.
const SOURCES: { key: ServiceKey; table: string; orderBy: string }[] = [
  { key: "diagnosis", table: "diagnosis_attempts", orderBy: "id" },
  { key: "goal", table: "goal_students", orderBy: "profile_id" },
  { key: "growth", table: "growth_profiles", orderBy: "profile_id" },
  { key: "growth", table: "growth_reports", orderBy: "id" },
  { key: "performance", table: "performance_sessions", orderBy: "id" },
  { key: "selfeval", table: "selfeval_sessions", orderBy: "id" },
  { key: "inquiry", table: "inquiry_sessions", orderBy: "id" },
];

const ID_CHUNK = 100;

/** 학생별로 쓴 서비스를 SERVICE_KEYS 순서로 돌려준다. 기록이 없는 학생도 빈 배열로 들어 있다. */
export async function loadServiceUsage(
  admin: SupabaseClient,
  studentIds: string[],
): Promise<Map<string, ServiceKey[]>> {
  const used = new Map<string, Set<ServiceKey>>(
    studentIds.map((id) => [id, new Set<ServiceKey>()]),
  );
  const chunks: string[][] = [];
  for (let i = 0; i < studentIds.length; i += ID_CHUNK) {
    chunks.push(studentIds.slice(i, i + ID_CHUNK));
  }
  await Promise.all(
    SOURCES.flatMap((source) =>
      chunks.map(async (chunk) => {
        const rows = await readAll<{ profile_id: string }>(
          admin,
          source.table,
          "profile_id",
          (q) => q.in("profile_id", chunk),
          source.orderBy,
        );
        for (const r of rows) used.get(r.profile_id)?.add(source.key);
      }),
    ),
  );
  return new Map(
    [...used].map(([id, keys]) => [
      id,
      SERVICE_KEYS.filter((k) => keys.has(k)),
    ]),
  );
}
