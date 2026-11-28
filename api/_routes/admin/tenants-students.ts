// /api/admin/tenants 아래 학생 라우트(move-student, student-usage). 관리자 앱이 .route("/tenants", tenantsStudents) 로 붙인다.
// 글자 그대로인 경로라 tenants-detail.ts 의 /:id 보다 먼저 붙인다. 요청 검증과 응답 모양은 shared/tenants/students.ts 를 따른다.
//
// POST /move-student { profileId, tenantId, grade, groupName?, className?, number? }: 스쿨멘토 본사 관리자가 학생을 다른 기관으로 옮긴다(사 결정 r4 4번, 결정 96, 101, 102). 소속만 바꾸던
//   fn_admin_set_profile_tenant 와 달리 옛 기관 학적과 대기 신청을 정리하고 대상 기관 학적을 만든다
//   (fn_admin_move_student_tenant, 한 트랜잭션). 반은 비워도 된다(결정 102.14).
//   권한: 메뉴 members edit. 옮긴 기록은 admin_access_logs 에 update / members 로 남긴다.
// GET /student-usage?profileId=: 본사가 서비스이용횟수조정 화면에서 학생 한 명의 6개 서비스 사용 상태를 본다(사 #166, 결정 r5, r6).
//   상태는 fn_tenant_usage_state(service_role 전용)가 정본이고, 기관 설정과 학생별 조정은 입력칸을 채우도록 원값 그대로 함께 돌려준다.
// PUT /student-usage { rows: [{ profile_id, program_key, monthly_limit?, term_limit? }] }: 학생별 조정(student_usage_overrides)을 upsert 한다.
//   변경 이력 트리거가 auth.uid() 를 변경자로 남기고 RLS 가 메뉴 권한이라 관리자 본인 토큰 클라이언트로 쓴다(service_role 이면 이력이 system 으로 남는다).
//   권한: 메뉴 serviceCreditAdjust(GET view, PUT edit)와 GET 은 tenants view 이상(기관 설정은 RLS 가 tenants view 로 제한한다). 스쿨멘토 전용(위닝은 404).

import { zValidator } from "@hono/zod-validator";
import { PROBLEM_CODE } from "../../../shared/http/codes.js";
import {
  type MovedStudent,
  moveStudentBody,
  putStudentUsageBody,
  STUDENT_MOVE_ERROR,
  type StudentUsage,
  type StudentUsageSaved,
  studentUsageQuery,
} from "../../../shared/tenants/students.js";
import { assertSectionPermission } from "../../_lib/adminPermission.js";
import { writeConsoleAuditLog } from "../../_lib/console/audit.js";
import { enrollmentRpcProblem } from "../../_lib/console/enrollmentErrors.js";
import {
  isEnrollmentGrade,
  isEnrollmentNumber,
} from "../../_lib/console/enrollmentInput.js";
import { admin, userClient } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import {
  methodNotAllowed,
  notFound,
  ProblemError,
  problemResponse,
} from "../../_lib/hono/problem.js";
import { nodeHeaders } from "../../_lib/hono/request.js";
import { validate } from "../../_lib/hono/validate.js";
import { SERVICE_CREDIT_PROGRAMS } from "../../_lib/service-credit/programs.js";
import { getBearerToken } from "../../_lib/serviceAccess.js";
import { isSchoolmentorSite } from "../../_lib/site.js";

const MEMBERS_RESOURCE_KEY = "members";

// 학년과 번호가 학적 규칙 안인지는 규칙이 있는 서버에서 더 본다.
const moveStudent = moveStudentBody.refine(
  (body) =>
    isEnrollmentGrade(body.grade) &&
    (body.number === null || isEnrollmentNumber(body.number)),
);

// program_key 가 서비스 목록 안에 있는지는 목록이 있는 서버에서 더 본다.
const putStudentUsage = putStudentUsageBody.superRefine((body, ctx) => {
  body.rows.forEach((row, index) => {
    if (
      !SERVICE_CREDIT_PROGRAMS.some(
        (program) => program.programKey === row.program_key,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["rows", index, "program_key"],
        message: "Invalid input",
      });
    }
  });
});

const siteNotFound = () =>
  new ProblemError(404, "찾을 수 없어요.", PROBLEM_CODE.NOT_FOUND);

interface UsageStateRow {
  allowed: boolean;
  deny_reason: string | null;
  month_used: number;
  month_limit: number | null;
  month_remaining: number | null;
  term_used: number;
  term_limit: number | null;
  term_remaining: number | null;
  month_resets_on: string | null;
  term_resets_on: string | null;
}

interface LimitRow {
  program_key: string;
  enabled?: boolean;
  monthly_limit: number | null;
  term_limit: number | null;
}

// supabase-js upsert 는 첫 행의 열만 쓰므로, 같은 열 묶음의 행끼리 모아 한 번씩 보낸다.
function groupByColumns<T extends Record<string, unknown>>(rows: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const columns = Object.keys(row).sort().join(",");
    groups.set(columns, [...(groups.get(columns) ?? []), row]);
  }
  return [...groups.values()];
}

const moveGuard = admin({
  permission: { key: MEMBERS_RESOURCE_KEY },
  // writeConsoleAuditLog 가 update 행을 직접 남긴다.
  audit: false,
  unhandledMessage: "학생을 옮기지 못했습니다.",
  logLabel: "[admin/tenants/move-student]",
});
const usageGuard = admin({
  permission: { key: "serviceCreditAdjust" },
  unhandledMessage: "학생 이용 현황을 처리하지 못했습니다.",
  logLabel: "[admin/tenants/student-usage]",
});

// 위닝은 404. 검증보다 먼저 막아 요청 값과 상관없이 같은 응답을 낸다.
const schoolmentorOnly = adminFactory.createMiddleware(async (_c, next) => {
  if (!isSchoolmentorSite()) throw siteNotFound();
  await next();
});

// 기관 설정은 tenants 메뉴 권한으로 보호되므로 두 번째 키를 같은 helper 로 본다.
const tenantsViewRequired = adminFactory.createMiddleware(async (c, next) => {
  await assertSectionPermission(
    c.var.supabaseAdmin,
    c.var.userId as string,
    "tenants",
    "view",
  );
  await next();
});

export const tenantsStudents = adminFactory
  .createApp()
  .post(
    "/move-student",
    moveGuard,
    // 입력 검증 실패 문구는 화면이 그대로 보여 주던 것을 유지한다.
    zValidator("json", moveStudent, (result, c) => {
      if (result.success) return;
      return problemResponse(
        c,
        400,
        "입력값을 확인해 주세요.",
        PROBLEM_CODE.VALIDATION_FAILED,
      );
    }),
    async (c) => {
      const userId = c.var.userId as string;
      const body = c.req.valid("json");

      const { data, error } = await c.var.supabaseAdmin.rpc(
        "fn_admin_move_student_tenant",
        {
          p_actor: userId,
          p_student: body.profileId,
          p_tenant: body.tenantId,
          p_grade: body.grade,
          // 빈 값은 null 로 넘겨 DB 의 원래 시그니처(text, smallint)와 맞춘다.
          p_group_name: body.groupName as string,
          p_class_name: body.className as string,
          p_number: body.number as number,
        },
      );
      if (error) {
        if (error.code === "P0002") {
          throw new ProblemError(
            404,
            "기관을 찾을 수 없어요.",
            STUDENT_MOVE_ERROR.TENANT_NOT_FOUND,
          );
        }
        // WC100: 올해 학적이 다른 기관에 남아 있다(기관마다 학년도 전환 시점이 달랐던 경우). 본사가 먼저 확인해야 한다.
        if (error.code === "WC100") {
          throw new ProblemError(
            409,
            "이 학생의 올해 학적이 다른 기관에 남아 있어요. 그 기관의 학적을 먼저 확인해 주세요.",
            STUDENT_MOVE_ERROR.OTHER_TENANT_ENROLLMENT,
          );
        }
        // WC077 의 점유 학생 이름은 가려서 싣는다(본사는 담임이 아니다).
        const problem = enrollmentRpcProblem(error, {
          slot: {
            grade: body.grade,
            className: body.className,
            number: body.number,
          },
          maskName: true,
        });
        if (problem) throw problem;
        throw new Error("move student failed");
      }
      const moved = data?.[0];
      if (!moved) throw new Error("fn_admin_move_student_tenant no row");

      await writeConsoleAuditLog(
        {
          supabaseAdmin: c.var.supabaseAdmin,
          userId,
          user:
            (
              await c.var.supabaseAdmin.auth.getUser(
                getBearerToken({ headers: nodeHeaders(c) }),
              )
            ).data.user ?? undefined,
          console: {
            kind: "hq",
            tenantId: moved.tenant_id,
            teacherId: null,
            classIds: [],
            proxySessionId: null,
            mustChangePassword: false,
            loginId: null,
            readOnly: false,
          },
        },
        {
          action: "update",
          resourceKey: MEMBERS_RESOURCE_KEY,
          targetId: body.profileId,
          meta: {
            fromTenantId: moved.from_tenant_id,
            toTenantId: moved.tenant_id,
            enrollmentId: moved.enrollment_id,
          },
        },
      );

      return c.json({
        fromTenantId: moved.from_tenant_id,
        tenantId: moved.tenant_id,
        enrollmentId: moved.enrollment_id,
      } satisfies MovedStudent);
    },
  )
  .all("/move-student", methodNotAllowed("POST"))
  .get(
    "/student-usage",
    usageGuard,
    schoolmentorOnly,
    tenantsViewRequired,
    validate("query", studentUsageQuery),
    async (c) => {
      const db = c.var.supabaseAdmin;
      const { profileId } = c.req.valid("query");

      const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("id, tenant_id")
        .eq("id", profileId)
        .maybeSingle();
      if (profileError) throw new Error("profile read failed");
      if (!profile) throw notFound("학생");
      const tenantId = (profile as { tenant_id: string | null }).tenant_id;

      const tenantRead = tenantId
        ? await db
            .from("tenants")
            .select("id, name, is_catch_all")
            .eq("id", tenantId)
            .maybeSingle()
        : { data: null, error: null };
      if (tenantRead.error) throw new Error("tenant read failed");
      const tenant = tenantRead.data as {
        id: string;
        name: string;
        is_catch_all: boolean;
      } | null;

      const [settings, overrides, states] = await Promise.all([
        tenantId
          ? db
              .from("tenant_service_settings")
              .select("program_key, enabled, monthly_limit, term_limit")
              .eq("tenant_id", tenantId)
          : { data: [], error: null },
        db
          .from("student_usage_overrides")
          .select("program_key, monthly_limit, term_limit")
          .eq("profile_id", profileId),
        Promise.all(
          SERVICE_CREDIT_PROGRAMS.map((program) =>
            db.rpc("fn_tenant_usage_state", {
              p_profile: profileId,
              p_program_key: program.programKey,
            }),
          ),
        ),
      ]);
      if (settings.error || overrides.error)
        throw new Error("limits read failed");
      if (states.some((state) => state.error))
        throw new Error("usage state read failed");

      const settingRows = (settings.data ?? []) as LimitRow[];
      const overrideRows = (overrides.data ?? []) as LimitRow[];

      return c.json({
        tenant: tenant
          ? {
              id: tenant.id,
              name: tenant.name,
              isCatchAll: tenant.is_catch_all,
            }
          : null,
        programs: SERVICE_CREDIT_PROGRAMS.map((program, index) => {
          const [state] = (states[index]?.data ?? []) as UsageStateRow[];
          const setting = settingRows.find(
            (row) => row.program_key === program.programKey,
          );
          const override = overrideRows.find(
            (row) => row.program_key === program.programKey,
          );
          return {
            programKey: program.programKey,
            allowed: state?.allowed ?? false,
            denyReason: state?.deny_reason ?? null,
            monthUsed: state?.month_used ?? 0,
            monthLimit: state?.month_limit ?? null,
            monthRemaining: state?.month_remaining ?? null,
            termUsed: state?.term_used ?? 0,
            termLimit: state?.term_limit ?? null,
            termRemaining: state?.term_remaining ?? null,
            monthResetsOn: state?.month_resets_on ?? null,
            termResetsOn: state?.term_resets_on ?? null,
            setting: setting
              ? {
                  enabled: setting.enabled ?? false,
                  monthlyLimit: setting.monthly_limit,
                  termLimit: setting.term_limit,
                }
              : null,
            override: override
              ? {
                  monthlyLimit: override.monthly_limit,
                  termLimit: override.term_limit,
                }
              : null,
          };
        }),
      } satisfies StudentUsage);
    },
  )
  .put(
    "/student-usage",
    usageGuard,
    schoolmentorOnly,
    validate("json", putStudentUsage),
    async (c) => {
      const { rows } = c.req.valid("json");

      const db = userClient(c);
      for (const group of groupByColumns(
        rows.map((row) => ({
          profile_id: row.profile_id,
          program_key: row.program_key,
          // 안 보낸 칸은 키째 빼야 기존 조정을 덮지 않는다(열 묶음도 키로 가른다).
          ...(row.monthly_limit !== undefined && {
            monthly_limit: row.monthly_limit,
          }),
          ...(row.term_limit !== undefined && { term_limit: row.term_limit }),
          updated_by: c.var.userId as string,
        })),
      )) {
        const { error } = await db
          .from("student_usage_overrides")
          .upsert(group, { onConflict: "profile_id,program_key" });
        // 없는 학생이면 외래키 위반이다. 서버 오류가 아니라 찾을 수 없음으로 돌려준다.
        if (error?.code === "23503") throw notFound("학생");
        if (error) throw new Error("student usage override upsert failed");
      }
      return c.json({ saved: rows.length } satisfies StudentUsageSaved);
    },
  )
  .all("/student-usage", methodNotAllowed("GET", "PUT"));
