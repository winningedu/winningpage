// 회원 관리 화면의 HTTP 호출(/api/admin/members...). 계약은 B8 계약서(members routes).
// 행 모양은 profiles 컬럼 전부를 받으므로 알려진 필드만 적고 나머지는 열어 둔다(CSV 내보내기가 config 컬럼으로 읽는다).

import { z } from "zod";
import { api } from "@/lib/http/client";
import {
  type MemberRow,
  memberRowSchema,
  membersListSchema,
} from "../../../../shared/members/contract.js";
import {
  type MemberLinks,
  type MemberMessages,
  type MemberOrders,
  type MemberPatchBody,
  type MemberServices,
  type MemberTenantBody,
  memberLinksSchema,
  memberMessagesSchema,
  memberOrdersSchema,
  memberServicesSchema,
} from "../../../../shared/members/detail.js";

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

export type ProfileRow = MemberRow;
export type LinkedPerson = MemberLinks["items"][number];
export type ProgramAccessRow = MemberServices["items"][number];
export type OrderRow = MemberOrders["items"][number];
export type MessageLogRow = MemberMessages["items"][number];

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
  api.get("admin/members", opts(signal)).json(membersListSchema);

export const fetchMember = (id: string, signal?: AbortSignal) =>
  api.get(one(id), opts(signal)).json(memberRowSchema);

export const fetchMemberLinks = (id: string, signal?: AbortSignal) =>
  api.get(`${one(id)}/links`, opts(signal)).json(memberLinksSchema);

export const fetchMemberServices = (id: string, signal?: AbortSignal) =>
  api.get(`${one(id)}/services`, opts(signal)).json(memberServicesSchema);

export const fetchMemberOrders = (id: string, signal?: AbortSignal) =>
  api.get(`${one(id)}/orders`, opts(signal)).json(memberOrdersSchema);

export const fetchMemberMessages = (id: string, signal?: AbortSignal) =>
  api.get(`${one(id)}/messages`, opts(signal)).json(memberMessagesSchema);

export const fetchTenantOptions = (signal?: AbortSignal) =>
  api.get("admin/tenant-options", opts(signal)).json(tenantOptionsSchema);

// 회원구분과 학부모 핸드폰은 한 번에 한 필드만 보낸다.
export const patchMember = (id: string, body: MemberPatchBody) =>
  api.patch(one(id), { json: body }).json(memberRowSchema);

export const putMemberTenant = (
  id: string,
  tenantId: MemberTenantBody["tenantId"],
) => api.put(`${one(id)}/tenant`, { json: { tenantId } }).json(memberRowSchema);

// phone 은 보내지 않는다. 마스킹 상태면 화면이 원문을 모르므로 서버가 profileId 로 읽는다.
export const sendMemberMessage = (profileId: string, text: string) =>
  api
    .post("admin/send-message", { json: { profileId, text } })
    .json(sentSchema);
