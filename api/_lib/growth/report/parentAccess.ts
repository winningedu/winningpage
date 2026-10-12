// 학부모가 자녀의 성장설계 리포트를 읽을 수 있는지 판단한다.
// 연결 규칙은 목표관리 선례(api/_lib/goal/reportNotify.ts, api/request-enrollment.ts)와 같다.
// parent_child_links 에서 status 가 approved 인 행만 연결로 본다. 새 규칙을 만들지 않는다.

import type { Db } from "../intake/collectDb.js";

export class NotLinkedError extends Error {
  constructor() {
    super("연결된 자녀가 아니에요.");
    this.name = "NotLinkedError";
  }
}

/** 연결 행 해석. 행이 있고 승인 상태일 때만 true. */
export function isApprovedLink(
  row: { status?: string | null } | null | undefined,
): boolean {
  return row?.status === "approved";
}

/** 연결된 자녀가 아니면 NotLinkedError, 조회 오류는 그대로 던진다. */
export async function assertParentOfChild(
  db: Db,
  parentUserId: string,
  childId: string,
): Promise<void> {
  const { data, error } = await db
    .from("parent_child_links")
    .select("status")
    .eq("parent_id", parentUserId)
    .eq("student_id", childId)
    .eq("status", "approved")
    .maybeSingle();
  if (error) throw new Error(`학부모 연결 조회 실패: ${error.message}`);
  if (!isApprovedLink(data)) throw new NotLinkedError();
}
