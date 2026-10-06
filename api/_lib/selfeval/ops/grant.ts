// 관리자 자기평가서 이용권 부여(POST /api/admin/selfeval-grant)의 순수 규칙.
// 본문 검증과 기간 계산(월말 보정, validity_days 올림)은 성장설계 부여와 같아서 그 구현을 쓴다.
// 달라지는 건 program_key 와 메모뿐이다. program_access_grants 제약(granted_by_actor 필수,
// 기간 컬럼 정합)은 growth/ops/grant.ts 상단 주석 참고.

import {
  buildGrantRow as buildGrowthGrantRow,
  type GrantRow,
} from "../../growth/ops/grant.js";

export {
  type GrantBody,
  validateGrantBody,
} from "../../growth/ops/grant.js";

// programs.program_key 와 consume_selfeval_credit 의 c_program_key 와 같은 값.
export const SELFEVAL_PROGRAM_KEY = "selfeval";

export function buildGrantRow(
  body: Parameters<typeof buildGrowthGrantRow>[0],
  actorId: string,
  nowIso: string,
): GrantRow {
  return {
    ...buildGrowthGrantRow(body, actorId, nowIso),
    program_key: SELFEVAL_PROGRAM_KEY,
    memo: "관리자 수동 부여(자기평가서 운영 도구)",
  };
}
