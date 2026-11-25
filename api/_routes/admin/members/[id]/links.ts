// GET /api/admin/members/:id/links
//
// 회원에게 묶인 학부모, 학생(대기, 승인)과 상대 프로필. 학부모면 parent_id 쪽, 아니면 student_id 쪽을 본다.
// 상대 프로필은 한 번에 읽어 id 로 맞춘다(없으면 null).

import { z } from "zod";
import { defineHandler } from "../../../../_lib/handler.js";
import { findMemberStub } from "../../../../_lib/members/member.js";

export const config = { runtime: "nodejs" };

const querySchema = z.object({ id: z.guid() });

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "members" },
  unhandledMessage: "연결 관계를 불러오지 못했습니다.",
  logLabel: "[admin/members/id/links]",
  headers: { "Cache-Control": "no-store" },
  query: querySchema,
  handler: async (_req, res, ctx) => {
    const admin = ctx.supabaseAdmin;
    const { id } = ctx.query;
    const member = await findMemberStub(admin, res, id);
    if (!member) return;

    // 저장된 member_type 원본 기준이다(화면의 분류 보정은 쓰지 않는다).
    const isParent = member.member_type === "parent";
    const { data: links, error } = await admin
      .from("parent_child_links")
      .select("id, parent_id, student_id, status")
      .eq(isParent ? "parent_id" : "student_id", id)
      .in("status", ["pending", "approved"]);
    if (error) throw new Error("parent_child_links read failed");

    const counterpartOf = (link: { parent_id: string; student_id: string }) =>
      isParent ? link.student_id : link.parent_id;
    const counterpartIds = (links ?? []).map(counterpartOf);

    const profiles = new Map<string, Record<string, unknown>>();
    if (counterpartIds.length > 0) {
      const { data, error: profileError } = await admin
        .from("profiles")
        .select("id, name, email, phone")
        .in("id", counterpartIds);
      if (profileError) throw new Error("counterpart profiles read failed");
      for (const row of data ?? []) profiles.set(row.id, row);
    }

    res.status(200).json({
      items: (links ?? []).map((link) => ({
        linkId: link.id,
        status: link.status,
        profile: profiles.get(counterpartOf(link)) ?? null,
      })),
    });
  },
});
