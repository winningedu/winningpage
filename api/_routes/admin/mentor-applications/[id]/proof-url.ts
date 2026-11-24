// POST /api/admin/mentor-applications/:id/proof-url
//
// 증빙 파일을 여는 60초짜리 서명 URL 을 돌려준다. 읽기라서 권한은 view 다.
// 신청이 없으면 404 NOT_FOUND, 경로가 비었거나 스토리지에 객체가 없으면 404 PROOF_NOT_FOUND.
// 그 밖의 스토리지 실패는 원문 없이 500 이다. 개인정보(성적표 등)가 든 파일이라 응답은 캐시하지 않는다.

import { z } from "zod";
import { defineHandler } from "../../../../_lib/handler.js";
import { sendError } from "../../../../_lib/httpResponse.js";
import { isObjectNotFound } from "../../../../_lib/mentor-application/isObjectNotFound.js";
import { BUCKET } from "../../../mentor-apply.js";

export const config = { runtime: "nodejs" };

// 어드민이 클릭 즉시 여는 일회성 열람이라 길게 잡을 이유가 없다.
const SIGNED_URL_TTL_SECONDS = 60;

export default defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "mentorApplications", level: "view" },
  unhandledMessage: "증빙 파일을 처리하지 못했어요.",
  logLabel: "[admin/mentor-applications/id/proof-url]",
  headers: { "Cache-Control": "no-store" },
  query: z.object({ id: z.uuid() }),
  handler: async (_req, res, ctx) => {
    const { data, error } = await ctx.supabaseAdmin
      .from("mentor_applications")
      .select("proof_file_path")
      .eq("id", ctx.query.id)
      .maybeSingle();
    if (error) throw new Error("mentor application read failed");
    if (!data) {
      sendError(
        res,
        "problem",
        404,
        "멘토 신청을 찾을 수 없어요.",
        "NOT_FOUND",
      );
      return;
    }

    const missing = () =>
      sendError(
        res,
        "problem",
        404,
        "등록된 증빙 파일이 없어요.",
        "PROOF_NOT_FOUND",
      );
    if (!data.proof_file_path) {
      missing();
      return;
    }

    const signed = await ctx.supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(data.proof_file_path, SIGNED_URL_TTL_SECONDS);
    // 경로는 있는데 객체가 없는 경우(행만 남았거나 업로드가 중간에 끊김)는 없음으로 흡수한다.
    if (isObjectNotFound(signed.error)) {
      missing();
      return;
    }
    if (signed.error || !signed.data?.signedUrl) {
      throw new Error("proof signed url failed");
    }
    res.status(200).json({ url: signed.data.signedUrl });
  },
});
