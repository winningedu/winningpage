// /api/admin/mentor-applications/:id 아래 멘토 신청 한 건 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/mentor-applications", mentorApplicationsDetail) 로 붙인다.
// 목록(루트 경로)은 api/_routes/admin/mentor-applications.ts 가 맡는다. 요청 검증과 응답 모양은 shared/mentor-application/detail.ts 를 따른다.
// 권한: 메뉴 mentorApplications(GET view, PATCH edit, proof-url 은 읽기라 view).

import type { MentorApplication } from "../../../shared/mentor-application/contract.js";
import {
  applicationIdParams,
  applicationStatusBody,
  MENTOR_APPLICATION_ERROR,
  type ProofUrl,
} from "../../../shared/mentor-application/detail.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import {
  methodNotAllowed,
  notFound,
  ProblemError,
} from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import { isObjectNotFound } from "../../_lib/mentor-application/isObjectNotFound.js";
import { BUCKET } from "../mentor-apply.js";

// 어드민이 클릭 즉시 여는 일회성 열람이라 길게 잡을 이유가 없다.
const SIGNED_URL_TTL_SECONDS = 60;

const WHAT = "멘토 신청";

const detailGuard = admin({
  permission: { key: "mentorApplications" },
  unhandledMessage: "멘토 신청 내역을 처리하지 못했어요.",
  logLabel: "[admin/mentor-applications/id]",
});
const proofGuard = admin({
  permission: { key: "mentorApplications", level: "view" },
  audit: { action: "view" },
  unhandledMessage: "증빙 파일을 처리하지 못했어요.",
  logLabel: "[admin/mentor-applications/id/proof-url]",
});

const proofMissing = () =>
  new ProblemError(
    404,
    "등록된 증빙 파일이 없어요.",
    MENTOR_APPLICATION_ERROR.PROOF_NOT_FOUND,
  );

export const mentorApplicationsDetail = adminFactory
  .createApp()
  // GET /:id: 신청 한 건, 없으면 404 NOT_FOUND.
  .get(
    "/:id",
    detailGuard,
    validate("param", applicationIdParams),
    async (c) => {
      const { data, error } = await c.var.supabaseAdmin
        .from("mentor_applications")
        .select("*")
        .eq("id", c.req.valid("param").id)
        .maybeSingle();
      if (error) throw new Error("mentor application read failed");
      if (!data) throw notFound(WHAT);
      return c.json(data satisfies MentorApplication);
    },
  )
  // PATCH /:id: 상태만 바꾼다. 닿은 행이 없으면 404.
  .patch(
    "/:id",
    detailGuard,
    validate("param", applicationIdParams),
    validate("json", applicationStatusBody),
    async (c) => {
      const { data, error } = await c.var.supabaseAdmin
        .from("mentor_applications")
        .update({ status: c.req.valid("json").status })
        .eq("id", c.req.valid("param").id)
        .select("*")
        .maybeSingle();
      if (error) throw new Error("mentor application update failed");
      if (!data) throw notFound(WHAT);
      return c.json(data satisfies MentorApplication);
    },
  )
  .all("/:id", methodNotAllowed("GET", "PATCH"))
  // POST /:id/proof-url: 증빙 파일을 여는 60초짜리 서명 URL. 신청이 없으면 404 NOT_FOUND,
  //   경로가 비었거나 스토리지에 객체가 없으면 404 PROOF_NOT_FOUND. 그 밖의 스토리지 실패는 원문 없이 500 이다.
  .post(
    "/:id/proof-url",
    proofGuard,
    validate("param", applicationIdParams),
    async (c) => {
      const { data, error } = await c.var.supabaseAdmin
        .from("mentor_applications")
        .select("proof_file_path")
        .eq("id", c.req.valid("param").id)
        .maybeSingle();
      if (error) throw new Error("mentor application read failed");
      if (!data) throw notFound(WHAT);
      if (!data.proof_file_path) throw proofMissing();

      const signed = await c.var.supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(data.proof_file_path, SIGNED_URL_TTL_SECONDS);
      // 경로는 있는데 객체가 없는 경우(행만 남았거나 업로드가 중간에 끊김)는 없음으로 흡수한다.
      if (isObjectNotFound(signed.error)) throw proofMissing();
      if (signed.error || !signed.data?.signedUrl) {
        throw new Error("proof signed url failed");
      }
      return c.json({ url: signed.data.signedUrl } satisfies ProofUrl);
    },
  )
  .all("/:id/proof-url", methodNotAllowed("POST"));
