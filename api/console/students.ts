// GET /api/console/students?tab=&grade=&groupId=&classId=&q=&page=&pageSize=
//
// W6 학생 관리. 기관의 현재 학년도 재학생을 학년, 그룹, 반, 번호(번호 없음은 뒤) 순으로 나눠 준다.
// 담임은 담당 학급 학생만 실명으로, 학교 관리자와 본사 대행은 전교를 가린 이름으로 본다(서버가 가린다).
// scopeTotal 은 필터 없이 범위 안의 학생 수라 "학생 없음"과 "조건에 맞는 학생 없음"을 가른다.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  compareClassName,
  gradeRank,
  loadClassIndex,
  loadTenant,
  readAll,
} from "../_lib/console/directory.js";
import { displayNameFor } from "../_lib/console/maskName.js";
import { paginate, parsePageQuery } from "../_lib/console/paging.js";
import { requireInScope, scopeQuery } from "../_lib/console/scope.js";
import {
  loadServiceUsage,
  SERVICE_KEYS,
  type ServiceKey,
} from "../_lib/console/serviceUsage.js";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

interface EnrollmentRow {
  student_id: string;
  grade: string | null;
  class_id: string | null;
  number: number | null;
  version: number;
}

// tab 값: 전체, 서비스 하나를 쓴 학생, 서비스를 하나도 안 쓴 학생(none).
const TABS: readonly string[] = ["all", "none", ...SERVICE_KEYS];

function queryValue(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === undefined || value === "" ? undefined : value;
}

const COLUMNS = "student_id, grade, class_id, number, version";

const PROFILE_CHUNK = 100;
const KST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });

const kstDate = (iso: string) => KST_DATE.format(new Date(iso));

/** 이름과 가입일(KST 날짜). in 목록이 URL 한도를 넘지 않게 100명씩 읽는다. */
async function loadProfiles(
  admin: SupabaseClient,
  ids: string[],
): Promise<Map<string, { name: string; joinedAt: string | null }>> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += PROFILE_CHUNK) {
    chunks.push(ids.slice(i, i + PROFILE_CHUNK));
  }
  const pages = await Promise.all(
    chunks.map((chunk) =>
      readAll<{ id: string; name: string | null; created_at: string | null }>(
        admin,
        "profiles",
        "id, name, created_at",
        (q) => q.in("id", chunk),
      ),
    ),
  );
  return new Map(
    pages.flat().map((p) => [
      p.id,
      {
        name: p.name ?? "",
        joinedAt: p.created_at ? kstDate(p.created_at) : null,
      },
    ]),
  );
}

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "학생 목록을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/students]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const pageQuery = parsePageQuery(req.query);
    if (!pageQuery) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const tab = queryValue(req.query.tab) ?? "all";
    if (!TABS.includes(tab)) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }
    const grade = queryValue(req.query.grade);
    const groupId = queryValue(req.query.groupId);
    const classId = queryValue(req.query.classId);
    const q = queryValue(req.query.q)?.trim().toLowerCase();
    // 담임이 담당 밖 학급을 지정하면 그 학급이 있는지 알려 주지 않는다.
    if (
      classId &&
      !requireInScope(res, "coded", actor, {
        tenantId: actor.tenantId,
        classId,
      })
    ) {
      return;
    }

    const { schoolYear, orgType } = await loadTenant(admin, actor.tenantId);
    const [current, classes] = await Promise.all([
      readAll<EnrollmentRow>(admin, "student_enrollments", COLUMNS, (query) =>
        scopeQuery(query, actor, { classColumn: "class_id" })
          .eq("school_year", schoolYear)
          .eq("status", "active"),
      ),
      loadClassIndex(admin, actor.tenantId),
    ]);
    const profiles = await loadProfiles(
      admin,
      current.map((e) => e.student_id),
    );
    const classOf = (e: EnrollmentRow) =>
      e.class_id ? classes.get(e.class_id) : undefined;
    const matches = current
      .filter((e) => !grade || e.grade === grade)
      .filter((e) => !classId || e.class_id === classId)
      .filter(
        (e) =>
          !groupId ||
          (e.class_id !== null && classes.get(e.class_id)?.groupId === groupId),
      )
      .filter(
        (e) =>
          !q ||
          (profiles.get(e.student_id)?.name ?? "").toLowerCase().includes(q),
      );
    matches.sort(
      (a, b) =>
        gradeRank(a.grade) - gradeRank(b.grade) ||
        (classOf(a)?.groupName ?? "").localeCompare(
          classOf(b)?.groupName ?? "",
          "ko",
        ) ||
        compareClassName(classOf(a)?.name ?? "", classOf(b)?.name ?? "") ||
        (a.number ?? 100) - (b.number ?? 100) ||
        a.student_id.localeCompare(b.student_id),
    );

    // 서비스 탭은 쪽을 나누기 전에 걸러야 하므로 그때만 모든 후보의 이용 서비스를 읽는다.
    let services = new Map<string, ServiceKey[]>();
    const usedOf = (id: string) => services.get(id) ?? [];
    let listed = matches;
    if (tab !== "all") {
      services = await loadServiceUsage(
        admin,
        matches.map((e) => e.student_id),
      );
      listed = matches.filter((e) => {
        const used = usedOf(e.student_id);
        return tab === "none"
          ? used.length === 0
          : used.includes(tab as ServiceKey);
      });
    }
    const paged = paginate(listed, pageQuery);
    if (tab === "all") {
      services = await loadServiceUsage(
        admin,
        paged.items.map((e) => e.student_id),
      );
    }
    res.status(200).json({
      total: paged.total,
      scopeTotal: current.length,
      page: paged.page,
      pageSize: pageQuery.pageSize,
      orgType,
      rows: paged.items.map((e) => {
        const cls = classOf(e);
        const used = usedOf(e.student_id);
        return {
          studentId: e.student_id,
          displayName: displayNameFor(
            actor,
            profiles.get(e.student_id)?.name ?? "",
          ),
          joinedAt: profiles.get(e.student_id)?.joinedAt ?? null,
          grade: e.grade,
          groupName: cls?.groupName ?? null,
          className: cls?.name ?? null,
          number: e.number,
          services: Object.fromEntries(
            SERVICE_KEYS.map((key) => [key, used.includes(key)]),
          ),
          serviceCount: used.length,
          urgency: null,
          canEdit: actor.kind === "homeroom",
          enrollmentVersion: e.version,
        };
      }),
    });
  },
});
