// 회원 관리 API 계약(루트 경로 GET /api/admin/members). 서버(api/_routes/admin/members.ts)가 이 모양으로 돌려주고, 브라우저(회원 관리 화면)가 응답 스키마로 검증한다.
// 행 모양은 profiles 컬럼 전부를 받으므로 알려진 필드만 적고 나머지는 열어 둔다(CSV 내보내기가 config 컬럼으로 읽는다).

import { z } from "zod";

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
  tenant_name: z.string().nullish(),
  service_labels: z.string().optional(),
  is_active: flag,
  terms_service_agreed: flag,
  privacy_required_agreed: flag,
  privacy_optional_agreed: flag,
  marketing_agreed: flag,
  ads_agreed: flag,
  sms_agreed: flag,
});

export type MemberRow = z.output<typeof memberRowSchema>;

/** GET /api/admin/members 응답. 최신순. */
export const membersListSchema = z.object({
  items: z.array(memberRowSchema),
});

export type MembersList = z.output<typeof membersListSchema>;
