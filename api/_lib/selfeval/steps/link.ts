// 연계 판정 단계(명세 No.174, 184, 196). 모델 한 번이 핵심 대 후보(1차)와 후보끼리(2차)를 함께 판정하고,
// 코드가 인정 조건을 확인해 selfeval_record_links 에 저장한다. 이용 횟수는 차감하지 않는다.

import { type Db, insertModelLinks, loadRecordLinks } from "../db.js";
import { mergeNewModelLinks } from "../linkEdit.js";
import {
  buildLinkPrompt,
  type LinkPromptInput,
  validateLinkResponse,
} from "../linkPrompt.js";
import type { SessionRow } from "../rows.js";
import {
  type ModelStepDeps,
  type Outcome,
  runModelStep,
} from "../runModelStep.js";
import type { CandidateRow, RecordLink } from "../types.js";

/** 핵심 외 후보의 상한(명세 No.174). */
export const MAX_LINK_CANDIDATES = 19;

export type LinkStepResult = { links: RecordLink[] };

export type LinkStepOutcome = Outcome<LinkStepResult> | { kind: "skipped" };

export function linkPromptInput(
  rows: CandidateRow[],
  coreId: string,
  session: Pick<SessionRow, "area" | "subject" | "activity_name">,
): LinkPromptInput | null {
  if (session.area === null) throw new Error("작성 영역이 없는 세션입니다.");
  const core = rows.find((r) => r.activity.id === coreId);
  if (!core) throw new Error("핵심 기록을 찾을 수 없습니다.");
  const others = rows
    .filter((r) => r.fit !== null && r.activity.id !== coreId)
    .sort((a, b) => (b.fit?.score ?? 0) - (a.fit?.score ?? 0))
    .slice(0, MAX_LINK_CANDIDATES)
    .map((r) => r.activity);
  if (others.length === 0) return null;
  return {
    core: core.activity,
    others,
    area: session.area,
    subject: session.subject,
    activityName: session.activity_name,
  };
}

export async function runLinkStep(
  db: Db,
  userId: string,
  session: SessionRow,
  deps: ModelStepDeps,
  rows: CandidateRow[],
  coreId: string,
): Promise<LinkStepOutcome> {
  const input = linkPromptInput(rows, coreId, session);
  if (input === null) return { kind: "skipped" };

  const out = await runModelStep<LinkStepResult>(
    db,
    userId,
    session,
    "link",
    deps,
    {
      build: (retryNotes) => buildLinkPrompt(input, retryNotes),
      validate: (value) => {
        const v = validateLinkResponse(value, input);
        if (!v.ok) return v;
        return { ok: true, patch: {}, result: { links: v.links } };
      },
      keepSession: true,
    },
  );
  if (out.kind !== "ok") return out;

  // 이미 저장된 쌍은 지운 것까지 그대로 둔다. 지운 연계를 모델이 되살리지 못한다(명세 No.194).
  const fresh = mergeNewModelLinks(
    await loadRecordLinks(db, session.id),
    out.result.links,
  );
  await insertModelLinks(db, session.id, fresh);
  return { ...out, result: { links: fresh } };
}
