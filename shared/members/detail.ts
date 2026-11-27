// 회원 상세 API 계약(/api/admin/members/:id 와 그 아래 경로). 서버(api/_routes/admin/members-detail.ts)가 이 모양으로 돌려주고,
// 브라우저(회원 관리 화면)가 응답 스키마로 검증한다. 목록과 행 모양은 contract.ts 에 있다.

import { z } from "zod";

/** 회원 상세 경로가 쓰는 도메인 오류 코드. 문구는 서버가 정한다. */
export const MEMBER_ERROR = {
  STUDENT_TENANT_REQUIRED: "STUDENT_TENANT_REQUIRED",
  PHONE_TAKEN: "PHONE_TAKEN",
  OTHER_TENANT_ENROLLMENT: "OTHER_TENANT_ENROLLMENT",
  TENANT_NOT_FOUND: "TENANT_NOT_FOUND",
} as const;

export type MemberErrorCode = (typeof MEMBER_ERROR)[keyof typeof MEMBER_ERROR];

/** 경로 :id 가 회원 uuid 인 라우트. 값이 .or() 필터 문자열에 들어가므로 uuid 만 통과시킨다. */
export const memberIdParams = z.object({ id: z.guid() });

const text = z.string().nullable().optional();

/** PATCH /:id. 화면이 쓰는 두 열만 받고 다른 키는 막는다(role 등 권한 열 보호). 둘 중 하나는 있어야 한다. */
export const memberPatchBody = z
  .strictObject({ member_category: text, guardian_phone: text })
  .refine(
    (body) =>
      body.member_category !== undefined || body.guardian_phone !== undefined,
  );

/** PUT /:id/tenant. null 은 소속 해제다. */
export const memberTenantBody = z.strictObject({
  tenantId: z.guid().nullable(),
});

const nullishText = z.string().nullish();

/** GET /:id/links 응답. 상대 프로필을 못 찾으면 profile 은 null. */
export const memberLinksSchema = z.object({
  items: z.array(
    z.object({
      linkId: z.string(),
      status: z.string(),
      profile: z
        .object({
          id: z.string(),
          name: nullishText,
          email: nullishText,
          phone: nullishText,
        })
        .nullable(),
    }),
  ),
});

/** GET /:id/services 응답. */
export const memberServicesSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      program_key: z.string(),
      payment_status: nullishText,
      access_status: nullishText,
      paid_amount: z.number().nullish(),
      starts_at: nullishText,
      expires_at: nullishText,
      access_started_at: nullishText,
      access_expires_at: nullishText,
    }),
  ),
});

/** GET /:id/orders 응답. */
export const memberOrdersSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      student_profile_id: nullishText,
      parent_profile_id: nullishText,
      status: nullishText,
      order_name: nullishText,
      amount: z.number().nullish(),
      list_amount: z.number().nullish(),
      discount_amount: z.number().nullish(),
      method: nullishText,
      paid_at: nullishText,
      created_at: nullishText,
    }),
  ),
});

/** GET /:id/messages 응답. 최근 100건. */
export const MEMBER_MESSAGES_LIMIT = 100;

export const memberMessagesSchema = z.object({
  items: z.array(
    z.object({
      id: z.number(),
      template_key: z.string(),
      channel: z.string(),
      subject: nullishText,
      message: z.string(),
      status: z.string(),
      provider_message: nullishText,
      sent_at: z.string(),
    }),
  ),
});

export type MemberPatchBody = z.input<typeof memberPatchBody>;
export type MemberTenantBody = z.input<typeof memberTenantBody>;
export type MemberLinks = z.output<typeof memberLinksSchema>;
export type MemberServices = z.output<typeof memberServicesSchema>;
export type MemberOrders = z.output<typeof memberOrdersSchema>;
export type MemberMessages = z.output<typeof memberMessagesSchema>;
