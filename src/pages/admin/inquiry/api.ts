// 심화탐구 세션 화면의 서버 호출. 응답 모양은 zod 로 검증하고, 조회는 react-query 키로 묶는다.

import { z } from "zod";
import { ApiError, api } from "@/lib/http/client";
import {
  inquirySession,
  inquirySessionsPage,
} from "../../../../shared/inquiry-session/contract.js";
import type { buildGrantBody } from "./grantForm";
import type { InquirySessionsParams } from "./query";

const grantSchema = z.object({ grantId: z.string(), quota: z.unknown() });
const recoverSchema = z.object({ newSessionId: z.string() });

export const inquirySessionKeys = {
  all: ["admin", "inquirySessions"] as const,
  list: (params: InquirySessionsParams) =>
    [...inquirySessionKeys.all, "list", params] as const,
  detail: (id: string) => [...inquirySessionKeys.all, "detail", id] as const,
};

export function fetchInquirySessions(
  params: InquirySessionsParams,
  signal?: AbortSignal,
) {
  return api
    .get("admin/inquiry-sessions", {
      searchParams: {
        ...(params.status ? { status: params.status } : {}),
        ...(params.q ? { q: params.q } : {}),
        page: params.page,
        pageSize: params.pageSize,
      },
      ...(signal ? { signal } : {}),
    })
    .json(inquirySessionsPage);
}

export function fetchInquirySession(id: string, signal?: AbortSignal) {
  return api
    .get(
      `admin/inquiry-sessions/${encodeURIComponent(id)}`,
      signal ? { signal } : {},
    )
    .json(inquirySession);
}

export function postInquiryGrant(body: ReturnType<typeof buildGrantBody>) {
  return api.post("admin/inquiry-grant", { json: body }).json(grantSchema);
}

export function postInquiryRecover(sessionId: string) {
  return api
    .post("admin/inquiry-recover", { json: { sessionId } })
    .json(recoverSchema);
}

/** 서버가 준 problem detail 을 그대로 보여주고, 응답을 읽지 못한 실패만 일반 문구로 대신한다. */
export function inquiryErrorText(error: unknown): string {
  return error instanceof ApiError ? error.detail : "요청에 실패했습니다.";
}
