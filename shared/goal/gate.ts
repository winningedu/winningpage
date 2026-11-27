// 목표관리 학생 라우트 공통 응답 조각. 조회형 GET 은 이용권이 없으면 에러가 아니라 200 { allowed: false } 를 준다.

import { z } from "zod";

/** 이용권 없음. 스쿨멘토는 기관 거부 사유(tenantReason)를 함께 싣는다. */
export const notAllowedResponse = z.object({
  allowed: z.literal(false),
  tenantReason: z.string().optional(),
});

/** 조회형 응답: 이용권이 없으면 notAllowedResponse, 있으면 본문. */
export const withNotAllowed = <S extends z.ZodType>(data: S) =>
  z.union([notAllowedResponse, data]);

/** 본문이 없는 성공(삭제 등). */
export const emptyResponse = z.object({});
