// GET /api/console/assign-pool?grade=&classId=&q=&page=&pageSize=
// POST /api/console/assign-pool { studentId, expectedVersion }
//
// W12 미배정 목록. 올해 재학 중이면서 학년이나 학급이 비어 있는 학생을 학교 관리자, 본사 대행, 담임에게 같게 준다.
// 소속코드로 가입하며 스스로 적은 반이 명단과 맞지 않은 학생(needs_confirm)도 "확인 필요"로 맨 앞에 준다.
// 이들은 적은 반에 그대로 있고 needsConfirm, 반 정보, canConfirm(담임은 담당 반 학생만)을 함께 싣는다.
// 담임도 담당 학급과 무관하게 기관 전체 풀을 본다. 이름은 가리지 않고 실명으로 주며, q 는 대소문자를 가리지 않는 부분 일치다.
// 동명 재학생(같은 기관, 같은 실명, 올해 학급이 있는 학생)은 번호 중복을 피해 배치하도록 이름 없이 함께 준다.
// classId 는 동명 재학생 확인만 그 반으로 좁힌다(결정 105). 배치 쓰기는 PATCH /api/console/students/enrollment 가 한다.
//
// POST { studentId, expectedVersion } 은 확인 필요 학생을 확인한다. 학생은 그 반에 그대로 있고 목록에서만 빠진다.
// 권한은 풀 배치와 같다: 학교 관리자와 본사 대행은 기관 전체, 담임은 담당 반 학생만(범위 밖은 404), 읽기 전용 대행은
// 공통 처리부가 POST 만 막는다(GET 은 읽힌다). version 검사와 이력(enrollment_changes kind confirm)은 fn_enrollment_confirm 이
// 한 트랜잭션으로 한다. 이미 확인된 학생은 바꾸지 않고 200 changed false 로 끝난다(멱등, 감사 로그도 남기지 않는다).
// 응답: 200 { version, changed }. 오류는 problem+json 의 code: 400 BAD_REQUEST, 404 NOT_FOUND(WC081),
// 409 VERSION_CONFLICT(WC078), 403 READ_ONLY_PROXY.

import { writeConsoleAuditLog } from "../../_lib/console/audit.js";
import {
  gradeRank,
  loadClassIndex,
  loadProfileNames,
  loadTenant,
  readAll,
} from "../../_lib/console/directory.js";
import { sendEnrollmentRpcError } from "../../_lib/console/enrollmentErrors.js";
import { paginate, parsePageQuery } from "../../_lib/console/paging.js";
import { queryValue } from "../../_lib/console/query.js";
import {
  loadServiceUsage,
  SERVICE_KEYS,
} from "../../_lib/console/serviceUsage.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

interface EnrollmentRow {
  student_id: string;
  grade: string | null;
  class_id: string | null;
  number: number | null;
  version: number;
  needs_confirm: boolean;
}

const COLUMNS = "student_id, grade, class_id, number, version, needs_confirm";

export default defineHandler({
  methods: ["GET", "POST"],
  auth: "console",
  errorShape: "problem",
  unhandledMessage: "미배정 목록을 처리하지 못했습니다.",
  logLabel: "[console/assign-pool]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    if (req.method === "POST") {
      const { studentId, expectedVersion } = (req.body ?? {}) as Record<
        string,
        unknown
      >;
      if (
        typeof studentId !== "string" ||
        studentId === "" ||
        !Number.isInteger(expectedVersion)
      ) {
        sendError(
          res,
          "problem",
          400,
          "입력 값을 확인해 주세요.",
          "BAD_REQUEST",
        );
        return;
      }

      const { data, error } = await ctx.supabaseAdmin.rpc(
        "fn_enrollment_confirm",
        {
          p_student: studentId,
          p_expected_version: expectedVersion as number,
          p_actor: ctx.userId,
          p_tenant: actor.tenantId,
          p_allowed_class_ids:
            actor.kind === "homeroom" ? actor.classIds : null,
        },
      );
      if (error) {
        if (sendEnrollmentRpcError(res, error, undefined, "problem")) return;
        throw new Error("fn_enrollment_confirm failed");
      }
      const row = (
        data as
          | { enrollment_id: string; version: number; changed: boolean }[]
          | null
      )?.[0];
      if (!row) throw new Error("fn_enrollment_confirm returned no row");

      if (row.changed) {
        await writeConsoleAuditLog(
          { ...ctx, supabaseAdmin: ctx.supabaseAdmin, console: actor },
          {
            action: "update",
            resourceKey: "studentEnrollment",
            targetId: studentId,
            meta: { kind: "confirm", version: row.version },
          },
        );
      }

      res.status(200).json({ version: row.version, changed: row.changed });
      return;
    }
    const admin = ctx.supabaseAdmin;

    const pageQuery = parsePageQuery(req.query);
    if (!pageQuery) {
      sendError(res, "problem", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }
    const grade = queryValue(req.query.grade);
    const classId = queryValue(req.query.classId);
    const q = queryValue(req.query.q)?.trim().toLowerCase();

    const { schoolYear } = await loadTenant(admin, actor.tenantId);
    const [current, classes] = await Promise.all([
      readAll<EnrollmentRow>(admin, "student_enrollments", COLUMNS, (query) =>
        query
          .eq("tenant_id", actor.tenantId)
          .eq("school_year", schoolYear)
          .eq("status", "active"),
      ),
      loadClassIndex(admin, actor.tenantId),
    ]);
    const names = await loadProfileNames(
      admin,
      current.map((e) => e.student_id),
    );
    const nameOf = (id: string) => names.get(id) ?? "";

    const enrolled = current.filter(
      (e) => e.class_id !== null && (!classId || e.class_id === classId),
    );
    const pool = current
      .filter((e) => e.needs_confirm || e.grade === null || e.class_id === null)
      .filter((e) => !grade || e.grade === grade)
      .filter((e) => !q || nameOf(e.student_id).toLowerCase().includes(q));
    pool.sort(
      (a, b) =>
        Number(b.needs_confirm) - Number(a.needs_confirm) ||
        gradeRank(a.grade) - gradeRank(b.grade) ||
        nameOf(a.student_id).localeCompare(nameOf(b.student_id), "ko") ||
        a.student_id.localeCompare(b.student_id),
    );

    const paged = paginate(pool, pageQuery);
    const sameNameOf = (id: string) =>
      enrolled.filter(
        (e) =>
          e.student_id !== id &&
          nameOf(e.student_id) !== "" &&
          nameOf(e.student_id) === nameOf(id),
      );
    const services = await loadServiceUsage(
      admin,
      paged.items.flatMap((e) =>
        sameNameOf(e.student_id).map((s) => s.student_id),
      ),
    );

    res.status(200).json({
      total: paged.total,
      page: paged.page,
      pageSize: pageQuery.pageSize,
      pageCount: paged.pageCount,
      items: paged.items.map((e) => {
        const sameName = sameNameOf(e.student_id);
        const cls = e.class_id ? classes.get(e.class_id) : undefined;
        return {
          studentId: e.student_id,
          name: nameOf(e.student_id),
          enrollmentVersion: e.version,
          grade: e.grade,
          needsConfirm: e.needs_confirm,
          canConfirm:
            e.needs_confirm &&
            (actor.kind !== "homeroom" ||
              (e.class_id !== null && actor.classIds.includes(e.class_id))),
          classId: e.class_id,
          groupName: cls?.groupName ?? null,
          className: cls?.name ?? null,
          number: e.number,
          sameNameCount: sameName.length,
          sameNameEnrolled: sameName.map((s) => {
            const cls = s.class_id ? classes.get(s.class_id) : undefined;
            return {
              grade: s.grade,
              groupName: cls?.groupName ?? null,
              className: cls?.name ?? null,
              number: s.number,
              usedServiceCount: services.get(s.student_id)?.length ?? 0,
              serviceTotal: SERVICE_KEYS.length,
            };
          }),
        };
      }),
    });
  },
});
