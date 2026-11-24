// 회원 라우트 공통. 회원 한 명을 읽고 소속 이름을 얹는 일과, 없을 때의 404 응답.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelResponse } from "@vercel/node";
import { sendError } from "../httpResponse.js";

export type MemberRow = Record<string, unknown> & { tenant_id?: string | null };

/** profiles 한 행에 소속 이름(tenants.name, 소속이 없거나 못 찾으면 빈 문자열)을 얹는다. */
export async function withTenantName(
  admin: SupabaseClient,
  profile: MemberRow,
): Promise<MemberRow> {
  if (!profile.tenant_id) return { ...profile, tenant_name: "" };
  const { data, error } = await admin
    .from("tenants")
    .select("name")
    .eq("id", profile.tenant_id)
    .maybeSingle();
  if (error) throw new Error("tenant name read failed");
  return { ...profile, tenant_name: data?.name ?? "" };
}

/** 회원이 있는지 확인하고 id 와 member_type 만 돌려준다. 없으면 404 를 보내고 null. */
export async function findMemberStub(
  admin: SupabaseClient,
  res: VercelResponse,
  id: string,
): Promise<{ id: string; member_type: string | null } | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, member_type")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("profile read failed");
  if (!data) {
    sendMemberNotFound(res);
    return null;
  }
  return data;
}

export function sendMemberNotFound(res: VercelResponse): void {
  sendError(res, "problem", 404, "회원을 찾을 수 없습니다.", "NOT_FOUND");
}
