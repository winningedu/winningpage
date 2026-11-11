// POST /api/lookup-child  { code }
//
// 학부모가 입력한 연결코드로 학생을 미리보기한다. 연결을 만들지는 않는다 —
// 실제 요청은 request_parent_link RPC(sql/40_auth_signup.sql [8])가 담당하고,
// 이 엔드포인트는 "이 코드가 내 자녀가 맞는지" 확인시켜 주는 용도다.
//
// RPC가 아니라 Vercel 함수인 이유
//   조회 한도를 걸려면 시도 이력을 남겨야 하는데, 그 테이블은 클라이언트가
//   보면 안 되는 서버 전용이다. service_role로만 접근하도록 여기서 처리한다.
//
// 로그인 필수
//   조회 결과에 미성년자의 이름과 학교가 들어간다. 익명으로 열어두면 한도를
//   IP로만 걸 수 있어 우회가 쉽고, 감사 추적도 남지 않는다. 학부모 회원으로
//   로그인한 상태에서만 호출할 수 있게 한다.
//
//   ⚠️ 따라서 학부모 가입 폼(ParentForm)은 가입 완료 후 로그아웃하면 안 된다.
//   학생 가입(StudentForm)은 가입 직후 signOut 하는 AS-IS 정책을 따르지만,
//   학부모는 가입 → 자녀 연결로 흐름이 이어지므로 세션을 유지해야 한다.

import type { VercelResponse } from "@vercel/node";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import { getClientIp } from "../_lib/phoneCode.js";
import {
  isQaAccount,
  QA_ACCOUNT_RESTRICTED_CODE,
  sendQaBlocked,
} from "../_lib/qaAccount.js";
import { getBearerToken } from "../_lib/serviceAccess.js";
import type { createSupabaseAdmin } from "../_lib/supabaseAdmin.js";

export const config = { runtime: "nodejs" };

const CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

// 정상 사용이라면 코드를 한두 번 입력하고 끝난다. 실패가 쌓이는 것은
// 추측의 신호이므로 전체 횟수보다 좁게 잡는다.
const MAX_LOOKUPS_PER_HOUR = 30;
const MAX_FAILED_PER_HOUR = 10;

function isoAgo(seconds: number) {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

async function countLookups(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  actorId: string,
  { onlyFailed = false }: { onlyFailed?: boolean } = {},
) {
  let query = supabase
    .from("link_code_lookups")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", actorId)
    .gte("created_at", isoAgo(3600));

  if (onlyFailed) query = query.eq("found", false);

  const { count, error } = await query;
  if (error) throw error;

  return count || 0;
}

function fail(
  res: VercelResponse,
  status: number,
  reason: string,
  message: string,
) {
  sendError(res, "okDetail", status, message, undefined, { reason });
}

export default defineHandler({
  methods: ["POST"],
  // change-phone.ts와 같은 이유(401 문구가 두 가지로 갈린다)로 auth:"none" +
  // 공유 getBearerToken을 쓴다(api/docs/batch-3-issues.md 참고).
  auth: "none",
  errorShape: "okDetail",
  unhandledMessage: "연결코드 조회 중 오류가 발생했습니다.",
  logLabel: "lookup-child",
  handler: async (req, res, ctx) => {
    // 입력 코드는 대문자로만 저장되므로 소문자 입력도 받아준다.
    const code = String(req.body?.code || "")
      .trim()
      .toUpperCase();

    const token = getBearerToken(req);

    if (!token) {
      return fail(res, 401, "not_authenticated", "로그인이 필요합니다.");
    }

    try {
      const supabase = ctx.supabaseAdmin;

      const { data: userData, error: userError } =
        await supabase.auth.getUser(token);
      const actorId = userData?.user?.id;

      if (userError || !actorId) {
        return void res.status(401).json({
          ok: false,
          reason: "not_authenticated",
          detail: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
        });
      }

      // 회원유형 확인 — 학생이 남의 코드를 조회할 이유가 없다.
      const { data: actor, error: actorError } = await supabase
        .from("profiles")
        .select("member_type")
        .eq("id", actorId)
        .maybeSingle();

      if (actorError) throw actorError;

      if (actor?.member_type !== "parent") {
        return void res.status(403).json({
          ok: false,
          reason: "not_a_parent",
          detail: "학부모 회원만 이용할 수 있습니다.",
        });
      }

      // 형식 검사는 인증·권한 확인 뒤에 한다. 그래야 로그인하지 않은 쪽에서
      // 형식만으로 코드 규칙을 떠보는 것을 막을 수 있다.
      if (!CODE_PATTERN.test(code)) {
        return void res.status(400).json({
          ok: false,
          reason: "invalid_code_format",
          detail: "연결코드 6자리를 정확히 입력해 주세요.",
        });
      }

      if (
        (await countLookups(supabase, actorId, { onlyFailed: true })) >=
        MAX_FAILED_PER_HOUR
      ) {
        return void res.status(429).json({
          ok: false,
          reason: "too_many_failed_lookups",
          detail: "조회 실패가 많습니다. 잠시 후 다시 시도해 주세요.",
        });
      }

      if ((await countLookups(supabase, actorId)) >= MAX_LOOKUPS_PER_HOUR) {
        return void res.status(429).json({
          ok: false,
          reason: "too_many_lookups",
          detail: "조회 횟수가 많습니다. 잠시 후 다시 시도해 주세요.",
        });
      }

      const { data: codeRow, error: codeError } = await supabase
        .from("student_link_codes")
        .select("student_id")
        .eq("code", code)
        .eq("is_active", true)
        .maybeSingle();

      if (codeError) throw codeError;

      const ip = getClientIp(req);

      // 성공·실패 모두 남긴다. 실패만 남기면 정상 사용량을 알 수 없고,
      // 성공만 남기면 추측 시도를 놓친다.
      await supabase.from("link_code_lookups").insert({
        actor_id: actorId,
        code,
        found: Boolean(codeRow),
        request_ip: ip,
      });

      if (!codeRow) {
        return void res.status(404).json({
          ok: false,
          reason: "link_code_not_found",
          detail: "일치하는 연결코드가 없습니다.",
        });
      }

      // QA 학부모는 QA 자녀만 볼 수 있다. 실제 미성년자의 이름과 학교를 QA 계정에 보여주지 않는다.
      if (
        (await isQaAccount(supabase, actorId)) &&
        !(await isQaAccount(supabase, codeRow.student_id))
      ) {
        return void sendQaBlocked(res, "okDetail", QA_ACCOUNT_RESTRICTED_CODE);
      }

      const { data: student, error: studentError } = await supabase
        .from("profiles")
        .select("name, school_name, school_type")
        .eq("id", codeRow.student_id)
        .maybeSingle();

      if (studentError) throw studentError;

      // 이미 다른 보호자와 연결된 학생이면 여기서 알려준다. 그냥 통과시키면
      // 학부모가 연결 요청까지 눌렀다가 student_already_linked로 거절당한다.
      const { count: linkedCount, error: linkedError } = await supabase
        .from("parent_child_links")
        .select("id", { count: "exact", head: true })
        .eq("student_id", codeRow.student_id)
        .eq("status", "approved");

      if (linkedError) throw linkedError;

      return void res.status(200).json({
        ok: true,
        child: {
          name: student?.name || "",
          school: student?.school_name || "",
          school_type: student?.school_type || "",
          // 학년은 profiles에 컬럼이 없다(기존 미해결 GAP). UI(ChildPreviewCard)는
          // '고3' 형태를 기대하므로, 학년 컬럼이 생기기 전까지는 null이다.
          grade: null,
        },
        already_linked: (linkedCount || 0) > 0,
      });
    } catch (error) {
      console.error("[lookup-child] 오류:", error);

      return void res.status(500).json({
        ok: false,
        reason: "unknown",
        detail: "연결코드 조회 중 오류가 발생했습니다.",
      });
    }
  },
});
