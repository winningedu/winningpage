// 성장설계 영업일 계산에 쓰는 회원 시간대(profiles.time_zone). 대체값 없이 없으면 던진다.

import { type Db, must, mustHave } from "./intake/collectDb.js";

export async function loadMemberTimeZone(
  db: Db,
  userId: string,
): Promise<string> {
  const row = must(
    await db
      .from("profiles")
      .select("time_zone")
      .eq("id", userId)
      .maybeSingle(),
    "profiles 조회 실패",
  );
  return mustHave(row, "profiles 행").time_zone;
}
