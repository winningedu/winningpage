// POST /api/inquiry/session
// Authorization: Bearer <access_token>
//
// 심화탐구 세션 부트스트랩 엔드포인트(명세 No.20, 21, 118, 개발계획 부록 A 1번).
//   요청  { action: "resume" } 또는
//         { action: "create", info: { gradeLabel, semester, career, subject } }
//   응답 200 { ok, session: SessionView|null, profile: { gradeLabel, semester, career }|null,
//             quota: QuotaView, handoff: HandoffView|null, records: RecordCandidate[],
//             subjectCounts, assets: AssetView[], topics: TopicView[], gradeNote: string|null,
//             replyResent: boolean }
//
// 계약:
//   - 이용권이 없으면 403 NO_ENTITLEMENT. reply_pending 세션은 성장설계 회신을 다시 보낸다.
//   - resume 은 열린 세션(draft, in_progress)이 없으면 session null 이다.
//   - create 는 열린 세션이 있으면 그 세션의 info 를 갱신한다(설계 리포트가 있으면 SESSION_LOCKED,
//     자산이 있고 과목이 바뀌면 자산을 비운다). 없으면 잔여 회차가 0 일 때 QUOTA_EXHAUSTED 다.
//     차감은 첫 추천 성공 때 하며 여기서는 하지 않는다. student_profiles 는 쓰지 않는다.
//
// 오류: INVALID_BODY 400, NO_ENTITLEMENT 403, SESSION_LOCKED 409, QUOTA_EXHAUSTED 429,
//       METHOD_NOT_ALLOWED 405, INTERNAL 500.
//
// 핸들러 본문은 DB 에 묶여 단위 테스트하지 않는다. 판단은 _lib/inquiry/bootstrap.ts, views.ts,
// reply.ts 의 순수 함수로 검증한다.

import type { VercelResponse } from "@vercel/node";
import { completePlanItemFromProgram } from "../_lib/growth/plan/complete.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { sortRecordCandidates, subjectCounts } from "../_lib/inquiry/assets.js";
import {
  asGradeLabel,
  decideCreate,
  type SessionInfo,
  validateSessionBody,
} from "../_lib/inquiry/bootstrap.js";
import {
  fail,
  hasInquiryAccess,
  loadHandoffView,
  loadSessionParts,
  NO_ENTITLEMENT_MESSAGE,
  readInquiryQuota,
} from "../_lib/inquiry/compose.js";
import {
  createSession,
  type Db,
  loadAssets,
  loadGrowthReports,
  loadOpenSession,
  loadRecordCandidates,
  loadStudentProfile,
  replaceAssets,
  updateSessionInfo,
} from "../_lib/inquiry/db.js";
import { pickLatestCompleted } from "../_lib/inquiry/growthHandoff.js";
import { resendPendingReplies } from "../_lib/inquiry/reply.js";
import { gradeNote } from "../_lib/inquiry/stage.js";
import { type SessionRow, toRecordCandidate } from "../_lib/inquiry/views.js";

type OpenInfo = {
  id: string;
  designReportId: string | null;
  subject: string;
  assetCount: number;
};

async function describeOpen(
  db: Db,
  userId: string,
  open: SessionRow | null,
): Promise<OpenInfo | null> {
  if (!open) return null;
  return {
    id: open.id,
    designReportId: open.design_report_id,
    subject: open.subject,
    assetCount: (await loadAssets(db, userId, open.id)).length,
  };
}

/** create 요청을 처리해 응답에 쓸 세션 행을 돌려준다. 막힌 경우는 응답까지 보내고 null 이다. */
async function applyCreate(
  res: VercelResponse,
  db: Db,
  userId: string,
  info: SessionInfo,
  quotaRemaining: number | null,
  nowIso: string,
): Promise<SessionRow | null> {
  // 동시 요청이 먼저 세션을 만들면 insert 가 null 을 돌려주므로 한 번 더 판단한다.
  for (let attempt = 0; attempt < 2; attempt++) {
    const open = await loadOpenSession(db, userId);
    const decision = decideCreate({
      openSession: await describeOpen(db, userId, open),
      quotaRemaining,
      info,
    });
    if (decision.kind === "locked") {
      fail(
        res,
        409,
        "SESSION_LOCKED",
        "설계 리포트가 만들어진 뒤에는 기본 정보를 바꿀 수 없어요.",
      );
      return null;
    }
    if (decision.kind === "quota_exhausted") {
      fail(
        res,
        429,
        "QUOTA_EXHAUSTED",
        "남은 이용 횟수가 없어요. 이용권을 확인해 주세요.",
      );
      return null;
    }
    if (decision.kind === "reuse") {
      if (decision.clearAssets) {
        await replaceAssets(db, userId, decision.sessionId, []);
      }
      return updateSessionInfo(db, userId, decision.sessionId, info, nowIso);
    }
    const latest = pickLatestCompleted(await loadGrowthReports(db, userId));
    const created = await createSession(
      db,
      userId,
      info,
      latest?.id ?? null,
      nowIso,
    );
    if (created) return created;
  }
  throw new Error("inquiry_sessions 생성 경쟁이 해소되지 않았습니다.");
}

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "심화탐구 세션을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "inquiry/session",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = requireUserId(ctx);
    const db = ctx.supabaseAdmin;
    const body = validateSessionBody(req.body);
    if (!body.ok) {
      fail(res, 400, "INVALID_BODY", body.reason);
      return;
    }
    if (!(await hasInquiryAccess(db, userId))) {
      fail(res, 403, "NO_ENTITLEMENT", NO_ENTITLEMENT_MESSAGE);
      return;
    }

    const nowIso = new Date().toISOString();
    const replyResent = await resendPendingReplies(db, userId, {
      complete: completePlanItemFromProgram,
    });
    const quota = await readInquiryQuota(db, userId);

    let row: SessionRow | null;
    if (body.body.action === "create") {
      row = await applyCreate(
        res,
        db,
        userId,
        body.body.info,
        quota.quotaRemaining,
        nowIso,
      );
      if (!row) return;
    } else {
      row = await loadOpenSession(db, userId);
    }

    const [profile, recordRows, parts] = await Promise.all([
      loadStudentProfile(db, userId),
      loadRecordCandidates(db, userId),
      row ? loadSessionParts(db, userId, row) : Promise.resolve(null),
    ]);
    const records = recordRows.map(toRecordCandidate);
    // 학년은 세션 값이 우선이고 없으면 공용 프로필 값이다. 졸업과 N수는 학년으로 읽지 않는다.
    const grade = asGradeLabel(row?.grade_label ?? profile?.grade);

    res.status(200).json({
      ok: true,
      session: parts?.session ?? null,
      profile: profile
        ? {
            gradeLabel: profile.grade,
            semester: profile.semester,
            career: profile.career,
          }
        : null,
      quota: {
        quotaTotal: quota.quotaTotal,
        quotaUsed: quota.quotaUsed,
        quotaRemaining: quota.quotaRemaining,
        planEndsAt: quota.planEndsAt,
        planLabel: quota.planLabel,
      },
      handoff: await loadHandoffView(db, userId, {
        grade,
        subject: row?.subject ?? "",
        nowIso,
      }),
      records: sortRecordCandidates(records, row?.subject ?? null),
      subjectCounts: subjectCounts(records),
      assets: parts?.assets ?? [],
      topics: parts?.topics ?? [],
      gradeNote: grade ? gradeNote(grade) : null,
      replyResent,
    });
  },
});

export const config = { runtime: "nodejs" };
