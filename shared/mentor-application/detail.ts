// 멘토 신청 한 건 API 계약(GET, PATCH /api/admin/mentor-applications/:id, POST /:id/proof-url).
// 서버(api/_routes/admin/mentor-applications-detail.ts)는 요청 스키마로 검증하고, 브라우저(src/pages/admin/mentor/api.ts)는 응답 스키마로 검증한다.
// 목록(루트 경로)의 계약은 shared/mentor-application/contract.ts 가 맡는다.

import { z } from "zod";
import { uuidId } from "../http/params.js";
import { MENTOR_APPLICATION_STATUS_OPTIONS } from "./status.js";

/** 이 경로들의 도메인 problem code. 공통 코드는 shared/http/codes.ts 다. */
export const MENTOR_APPLICATION_ERROR = {
  /** 증빙 경로가 비었거나 스토리지에 객체가 없다. */
  PROOF_NOT_FOUND: "PROOF_NOT_FOUND",
} as const;

const STATUSES = MENTOR_APPLICATION_STATUS_OPTIONS.map(
  (option) => option.value,
);

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/** 경로 :id. */
export const applicationIdParams = z.object({ id: uuidId });

/** PATCH 본문. 상태만 바꾼다(옛 화면도 status 만 썼다). 다른 키는 strict 가 400 으로 막는다. */
export const applicationStatusBody = z.strictObject({
  status: z.string().refine((value) => STATUSES.includes(value)),
});

export type ApplicationStatusInput = z.input<typeof applicationStatusBody>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

// 신청 한 행. 쓰는 컬럼만 명시하고 나머지는 통과시킨다(목록 계약의 행과 같은 모양).
export const applicationDetailSchema = z.looseObject({
  id: z.string(),
  status: z.string().nullish(),
  proof_file_path: z.string().nullish(),
  proof_file_name: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});

export type ApplicationDetail = z.output<typeof applicationDetailSchema>;

/** POST /:id/proof-url 200. 60초짜리 서명 URL. */
export const proofUrlSchema = z.object({ url: z.string() });

export type ProofUrl = z.output<typeof proofUrlSchema>;
