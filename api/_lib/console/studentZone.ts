// 학생의 하루 기준 시간대(profiles.time_zone). 목표 기록(record_date)은 학생이 사는 곳의 하루로 묶인다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "./directory.js";

/** 프로필 행이 없을 때의 대비. 서울 같은 특정 지역으로 기울지 않게 UTC 로 둔다. */
const FALLBACK_ZONE = "UTC";

/** 학생 id 목록의 시간대를 한 번에 읽는다(in 목록 한 번). 호출하는 쪽이 100명 이내로 끊어 넘긴다. */
export async function loadStudentZones(
  admin: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await readAll<{ id: string; time_zone: string | null }>(
    admin,
    "profiles",
    "id, time_zone",
    (q) => q.in("id", ids),
  );
  const zones = new Map(ids.map((id) => [id, FALLBACK_ZONE]));
  for (const r of rows) zones.set(r.id, r.time_zone ?? FALLBACK_ZONE);
  return zones;
}
