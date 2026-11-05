// GET /api/console/service-status?service=&grade=&groupId=&classId=&q=&page=&pageSize=
//
// W8 서비스별 현황표. 고른 서비스를 쓰는 학생만(교 #41) 현재 학년도 학년, 반, 번호 순으로 나눠 준다.
// 담임은 담당 학급만, 학교 관리자와 본사 대행은 전교를 본다. 이름은 담임만 실명이고 그 밖에는 서버에서 가린다.
// q 는 실명 부분 일치다. 서비스별 열 값(detail)은 쪽에 보이는 학생만 읽는다. asOf 는 집계 기준일(KST)이다.

import { loadProfileNames, loadTenant } from "../_lib/console/directory.js";
import { kstDateOffset } from "../_lib/console/goalStatus.js";
import { displayNameFor } from "../_lib/console/maskName.js";
import { paginate, parsePageQuery } from "../_lib/console/paging.js";
import { loadServiceDetail } from "../_lib/console/serviceStatus.js";
import {
  loadServiceUsage,
  SERVICE_KEYS,
  type ServiceKey,
} from "../_lib/console/serviceUsage.js";
import { loadScopedStudents } from "../_lib/console/studentScope.js";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

function queryValue(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === undefined || value === "" ? undefined : value;
}

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "서비스별 현황표를 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/service-status]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const service = queryValue(req.query.service);
    const pageQuery = parsePageQuery(req.query);
    if (
      !pageQuery ||
      !service ||
      !(SERVICE_KEYS as readonly string[]).includes(service)
    ) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }
    const q = queryValue(req.query.q)?.trim().toLowerCase();

    const students = await loadScopedStudents(admin, actor, {
      grade: queryValue(req.query.grade),
      groupId: queryValue(req.query.groupId),
      classId: queryValue(req.query.classId),
    });
    const ids = students.map((s) => s.studentId);
    const [names, usage] = await Promise.all([
      loadProfileNames(admin, ids),
      loadServiceUsage(admin, ids),
    ]);
    const matches = students
      .filter((s) => usage.get(s.studentId)?.includes(service as ServiceKey))
      .filter(
        (s) => !q || (names.get(s.studentId) ?? "").toLowerCase().includes(q),
      );

    const paged = paginate(matches, pageQuery);
    const detail = await loadServiceDetail(
      admin,
      service as ServiceKey,
      paged.items.map((s) => s.studentId),
    );
    const { orgType } = await loadTenant(admin, actor.tenantId);
    res.status(200).json({
      ...paged,
      asOf: kstDateOffset(new Date(), 0),
      orgType,
      items: paged.items.map((s) => ({
        studentId: s.studentId,
        name: displayNameFor(actor, names.get(s.studentId) ?? ""),
        grade: s.grade,
        groupName: s.groupName,
        className: s.className,
        number: s.number,
        detail: detail.get(s.studentId) ?? null,
      })),
    });
  },
});
