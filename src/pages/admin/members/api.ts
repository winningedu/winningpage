// 회원 관리 화면의 HTTP 호출(/api/admin/members...). 계약은 B8 계약서(members routes).
// 행 모양은 profiles 컬럼 전부를 받으므로 알려진 필드만 적고 나머지는 열어 둔다(CSV 내보내기가 config 컬럼으로 읽는다).

import { z } from "zod";
import { api } from "@/lib/http/client";

const text = z.string().nullish();
const flag = z.boolean().nullish();

export const memberRowSchema = z.looseObject({
  id: z.string(),
  name: text,
  username: text,
  email: text,
  phone: text,
  member_type: text,
  role: text,
  created_at: text,
  birth_date: text,
  gender: text,
  school_name: text,
  school_type: text,
  region: text,
  address: text,
  address_detail: text,
  landline: text,
  guardian_phone: text,
  memo: text,
  member_category: text,
  tenant_id: text,
  tenant_name: z.string().optional(),
  service_labels: z.string().optional(),
  is_active: flag,
  terms_service_agreed: flag,
  privacy_required_agreed: flag,
  privacy_optional_agreed: flag,
  marketing_agreed: flag,
  ads_agreed: flag,
  sms_agreed: flag,
});

const membersSchema = z.object({ items: z.array(memberRowSchema) });

const linksSchema = z.object({
  items: z.array(
    z.object({
      linkId: z.string(),
      status: z.string(),
      profile: z
        .object({
          id: z.string(),
          name: text,
          email: text,
          phone: text,
        })
        .nullable(),
    }),
  ),
});

const servicesSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      program_key: z.string(),
      payment_status: text,
      access_status: text,
      paid_amount: z.number().nullish(),
      starts_at: text,
      expires_at: text,
      access_started_at: text,
      access_expires_at: text,
    }),
  ),
});

const ordersSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      student_profile_id: text,
      parent_profile_id: text,
      status: text,
      order_name: text,
      amount: z.number().nullish(),
      list_amount: z.number().nullish(),
      discount_amount: z.number().nullish(),
      method: text,
      paid_at: text,
      created_at: text,
    }),
  ),
});

const messagesSchema = z.object({
  items: z.array(
    z.object({
      id: z.number(),
      template_key: z.string(),
      channel: z.string(),
      subject: text,
      message: z.string(),
      status: z.string(),
      provider_message: text,
      sent_at: z.string(),
    }),
  ),
});

const sentSchema = z.looseObject({ channel: z.string() });

const tenantOptionsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      org_type: z.string().nullable(),
      is_catch_all: z.boolean(),
    }),
  ),
});

export type ProfileRow = z.infer<typeof memberRowSchema>;
export type LinkedPerson = z.infer<typeof linksSchema>["items"][number];
export type ProgramAccessRow = z.infer<typeof servicesSchema>["items"][number];
export type OrderRow = z.infer<typeof ordersSchema>["items"][number];
export type MessageLogRow = z.infer<typeof messagesSchema>["items"][number];
export type TenantOption = z.infer<typeof tenantOptionsSchema>["items"][number];

export const memberKeys = {
  all: ["admin", "members"] as const,
  list: ["admin", "members", "list"] as const,
  detail: (id: string) => ["admin", "members", "detail", id] as const,
  links: (id: string) => ["admin", "members", id, "links"] as const,
  services: (id: string) => ["admin", "members", id, "services"] as const,
  orders: (id: string) => ["admin", "members", id, "orders"] as const,
  messages: (id: string) => ["admin", "members", id, "messages"] as const,
  tenantOptions: ["admin", "tenant-options"] as const,
};

const one = (id: string) => `admin/members/${encodeURIComponent(id)}`;
const opts = (signal?: AbortSignal) => (signal ? { signal } : {});

export const fetchMembers = (signal?: AbortSignal) =>
  api.get("admin/members", opts(signal)).json(membersSchema);

export const fetchMember = (id: string, signal?: AbortSignal) =>
  api.get(one(id), opts(signal)).json(memberRowSchema);

export const fetchMemberLinks = (id: string, signal?: AbortSignal) =>
  api.get(`${one(id)}/links`, opts(signal)).json(linksSchema);

export const fetchMemberServices = (id: string, signal?: AbortSignal) =>
  api.get(`${one(id)}/services`, opts(signal)).json(servicesSchema);

export const fetchMemberOrders = (id: string, signal?: AbortSignal) =>
  api.get(`${one(id)}/orders`, opts(signal)).json(ordersSchema);

export const fetchMemberMessages = (id: string, signal?: AbortSignal) =>
  api.get(`${one(id)}/messages`, opts(signal)).json(messagesSchema);

export const fetchTenantOptions = (signal?: AbortSignal) =>
  api.get("admin/tenant-options", opts(signal)).json(tenantOptionsSchema);

// 회원구분과 학부모 핸드폰은 한 번에 한 필드만 보낸다.
export const patchMember = (
  id: string,
  body: { member_category: string | null } | { guardian_phone: string | null },
) => api.patch(one(id), { json: body }).json(memberRowSchema);

export const putMemberTenant = (id: string, tenantId: string | null) =>
  api.put(`${one(id)}/tenant`, { json: { tenantId } }).json(memberRowSchema);

// phone 은 보내지 않는다. 마스킹 상태면 화면이 원문을 모르므로 서버가 profileId 로 읽는다.
export const sendMemberMessage = (profileId: string, text: string) =>
  api
    .post("admin/send-message", { json: { profileId, text } })
    .json(sentSchema);
