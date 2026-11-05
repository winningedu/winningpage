// GET /api/console/enrollment/summary?grade=&classId=
//
// W7 이용현황. 학교 관리자와 본사 대행만. 현재 학년도 학급마다 재학생 총원, 정원(없으면 null),
// 서비스를 하나라도 쓴 학생 수(joined)와 서비스별 이용 인원을 준다. 학생 이름은 담지 않는다(집계만, 교 #40).

import {
  compareClassName,
  gradeRank,
  loadClassIndex,
  loadTenant,
  readAll,
} from "../../_lib/console/directory.js";
import {
  loadServiceUsage,
  SERVICE_KEYS,
  type ServiceKey,
} from "../../_lib/console/serviceUsage.js";
import { loadScopedStudents } from "../../_lib/console/studentScope.js";
import { defineHandler } from "../../_lib/handler.js";

export const config = { runtime: "nodejs" };

function queryValue(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === undefined || value === "" ? undefined : value;
}

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "이용현황을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/enrollment/summary]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;
    const grade = queryValue(req.query.grade);
    const classId = queryValue(req.query.classId);

    const { schoolYear } = await loadTenant(admin, actor.tenantId);
    const [students, classes, capacities, assignments, teachers] =
      await Promise.all([
        loadScopedStudents(admin, actor, { grade, classId }),
        loadClassIndex(admin, actor.tenantId),
        readAll<{ id: string; capacity: number | null }>(
          admin,
          "classes",
          "id, capacity",
          (q) =>
            q.eq("tenant_id", actor.tenantId).eq("school_year", schoolYear),
        ),
        readAll<{ class_id: string; teacher_id: string }>(
          admin,
          "teacher_class_assignments",
          "class_id, teacher_id",
          (q) => q.eq("tenant_id", actor.tenantId),
          "class_id",
        ),
        readAll<{ id: string; name: string }>(
          admin,
          "teachers",
          "id, name",
          (q) => q.eq("tenant_id", actor.tenantId),
        ),
      ]);
    const usage = await loadServiceUsage(
      admin,
      students.map((s) => s.studentId),
    );

    const capacityOf = new Map(capacities.map((c) => [c.id, c.capacity]));
    const teacherName = new Map(teachers.map((t) => [t.id, t.name]));
    const homeroomOf = new Map(
      assignments.map((a) => [
        a.class_id,
        teacherName.get(a.teacher_id) ?? null,
      ]),
    );

    const rows = [...capacityOf.keys()]
      .map((id) => classes.get(id))
      .filter((c) => !!c)
      .filter(
        (c) => (!grade || c.grade === grade) && (!classId || c.id === classId),
      )
      .sort(
        (a, b) =>
          gradeRank(a.grade) - gradeRank(b.grade) ||
          (a.groupName ?? "").localeCompare(b.groupName ?? "", "ko") ||
          compareClassName(a.name, b.name),
      )
      .map((cls) => {
        const members = students.filter((s) => s.classId === cls.id);
        const services = Object.fromEntries(
          SERVICE_KEYS.map((key) => [key, 0]),
        ) as Record<ServiceKey, number>;
        let joined = 0;
        for (const s of members) {
          const used = usage.get(s.studentId) ?? [];
          if (used.length > 0) joined += 1;
          for (const key of used) services[key] += 1;
        }
        return {
          classId: cls.id,
          grade: cls.grade,
          groupName: cls.groupName,
          className: cls.name,
          homeroomName: homeroomOf.get(cls.id) ?? null,
          total: members.length,
          capacity: capacityOf.get(cls.id) ?? null,
          joined,
          services,
        };
      });

    res.status(200).json({ classes: rows });
  },
});
