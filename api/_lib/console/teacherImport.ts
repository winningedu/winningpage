// 교사 엑셀 일괄 등록(W15) 도우미. 행 판정은 서버가 다시 계산하고, 등록은 T13 의 등록 경로를 그대로 쓴다.
// 임시 비밀번호는 응답에 한 번만 싣고 저장하거나 로그에 남기지 않는다. 실행 기록에는 행 번호와 판정 코드만 둔다.

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type ConsoleAuditCtx, writeConsoleAuditLog } from "./audit.js";
import {
  type RegisterInput,
  RpcError,
  registerTeacherWithAccount,
  TEACHERS_RESOURCE_KEY,
} from "./teacherAccounts.js";

/** 클라이언트가 나눠 보내는 한 번의 행 수 상한(설계 R7). */
export const MAX_IMPORT_ROWS = 20;

const GRADES = ["중1", "중2", "중3", "고1", "고2", "고3"];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ImportRowInput {
  name: string;
  phone: string;
  grade: string;
  group: string;
  className: string;
}

export interface ImportRequest {
  requestId: string;
  mode: "overwrite" | "skip";
  rows: ImportRowInput[];
}

/** 요청 본문 검증. 모양이 틀리면 null. 행 내용의 옳고 그름은 판정이 맡는다. */
export function parseImportBody(body: unknown): ImportRequest | null {
  const { requestId, mode, rows } = (body ?? {}) as Record<string, unknown>;
  if (typeof requestId !== "string" || !UUID_RE.test(requestId)) return null;
  if (mode !== "overwrite" && mode !== "skip") return null;
  if (
    !Array.isArray(rows) ||
    rows.length === 0 ||
    rows.length > MAX_IMPORT_ROWS
  )
    return null;
  const parsed: ImportRowInput[] = [];
  for (const raw of rows as Record<string, unknown>[]) {
    if (typeof raw?.name !== "string" || typeof raw.phone !== "string")
      return null;
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    parsed.push({
      name: raw.name,
      phone: raw.phone,
      grade: text(raw.grade),
      group: text(raw.group),
      className: text(raw.className),
    });
  }
  return { requestId, mode, rows: parsed };
}

export type ImportVerdict =
  | "format_error"
  | "group_not_registered"
  | "class_duplicate"
  | "phone_conflict"
  | "same_name_other"
  | "shared_login"
  | "same"
  | "changed"
  | "new";

const ERROR_VERDICTS: ImportVerdict[] = [
  "format_error",
  "group_not_registered",
  "class_duplicate",
  "phone_conflict",
];

export interface ImportRowResult {
  index: number;
  verdict: ImportVerdict;
  applied: boolean;
}

export interface ImportAccount {
  loginId: string;
  tempPassword: string;
  rowIndexes: number[];
}

export interface ImportOutcome {
  runId: string;
  replayed: boolean;
  counts: {
    total: number;
    created: number;
    updated: number;
    accounts: number;
    errors: number;
    skipped: number;
  };
  rows: ImportRowResult[];
  accounts: ImportAccount[];
}

interface ExistingTeacher {
  id: string;
  name: string;
  phone: string;
  deleted_at?: string | null;
}

interface JudgeContext {
  orgType: string;
  groups: Map<string, string>;
  teachersByPhone: Map<string, ExistingTeacher>;
  /** 이름이 같은 기존 교사들의 전화번호. */
  phonesByName: Map<string, Set<string>>;
  classIdByKey: Map<string, string>;
  holderByClassId: Map<string, ExistingTeacher>;
}

function classKeyOf(grade: string, groupId: string | null, name: string) {
  return `${grade}|${groupId ?? ""}|${name.toLowerCase()}`;
}

/** 서버의 fn_normalize_class_name 과 같은 규칙: 학교는 숫자만(앞의 0 제거), 그 밖은 공백 제거. */
function normalizeClassName(orgType: string, raw: string): string {
  return orgType === "학교"
    ? raw.replace(/\D/g, "").replace(/^0+/, "")
    : raw.replace(/\s/g, "");
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

interface PreparedRow {
  index: number;
  name: string;
  phone: string;
  grade: string;
  className: string;
  groupId: string | null;
  classKey: string | null;
  classId: string | null;
}

async function loadJudgeContext(
  admin: SupabaseClient,
  tenantId: string,
  phones: string[],
  names: string[],
  grades: string[],
): Promise<JudgeContext> {
  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .select("org_type, school_year")
    .eq("id", tenantId)
    .maybeSingle();
  if (tenantError || !tenant)
    throw new RpcError("tenant read", tenantError?.code);

  const { data: groups, error: groupError } = await admin
    .from("class_groups")
    .select("id, name, deleted_at")
    .eq("tenant_id", tenantId);
  if (groupError) throw new RpcError("class_groups read", groupError.code);

  const { data: teachers, error: teacherError } = await admin
    .from("teachers")
    .select("id, name, phone, deleted_at")
    .eq("tenant_id", tenantId)
    .in("phone", phones);
  if (teacherError) throw new RpcError("teachers read", teacherError.code);

  const { data: sameNames, error: nameError } = await admin
    .from("teachers")
    .select("id, name, phone, deleted_at")
    .eq("tenant_id", tenantId)
    .in("name", names);
  if (nameError) throw new RpcError("teachers read", nameError.code);

  const classIdByKey = new Map<string, string>();
  const holderByClassId = new Map<string, ExistingTeacher>();
  if (grades.length > 0) {
    const { data: classes, error: classError } = await admin
      .from("classes")
      .select("id, grade, group_id, name")
      .eq("tenant_id", tenantId)
      .eq("school_year", tenant.school_year)
      .in("grade", grades);
    if (classError) throw new RpcError("classes read", classError.code);
    for (const c of (classes ?? []) as {
      id: string;
      grade: string;
      group_id: string | null;
      name: string;
    }[]) {
      classIdByKey.set(classKeyOf(c.grade, c.group_id, c.name), c.id);
    }

    const classIds = [...classIdByKey.values()];
    if (classIds.length > 0) {
      const { data: assignments, error: assignError } = await admin
        .from("teacher_class_assignments")
        .select("teacher_id, class_id")
        .in("class_id", classIds);
      if (assignError) throw new RpcError("assignments read", assignError.code);
      const teacherByClass = new Map(
        ((assignments ?? []) as { teacher_id: string; class_id: string }[]).map(
          (a) => [a.class_id, a.teacher_id],
        ),
      );
      const { data: holders, error: holderError } = await admin
        .from("teachers")
        .select("id, name, phone, deleted_at")
        .in("id", [...new Set(teacherByClass.values())]);
      if (holderError) throw new RpcError("teachers read", holderError.code);
      const holderById = new Map(
        ((holders ?? []) as ExistingTeacher[]).map((t) => [t.id, t]),
      );
      for (const [classId, teacherId] of teacherByClass) {
        const holder = holderById.get(teacherId);
        if (holder) holderByClassId.set(classId, holder);
      }
    }
  }

  const phonesByName = new Map<string, Set<string>>();
  for (const t of ((sameNames ?? []) as ExistingTeacher[]).filter(
    (t) => !t.deleted_at,
  )) {
    phonesByName.set(
      t.name,
      (phonesByName.get(t.name) ?? new Set()).add(t.phone),
    );
  }

  return {
    orgType: tenant.org_type as string,
    groups: new Map(
      (
        (groups ?? []) as {
          id: string;
          name: string;
          deleted_at?: string | null;
        }[]
      )
        .filter((g) => !g.deleted_at)
        .map((g) => [g.name.toLowerCase(), g.id]),
    ),
    teachersByPhone: new Map(
      ((teachers ?? []) as ExistingTeacher[])
        .filter((t) => !t.deleted_at)
        .map((t) => [t.phone, t]),
    ),
    phonesByName,
    classIdByKey,
    holderByClassId,
  };
}

/** 형식, 그룹, 전화번호, 학급 중복 순으로 본다. 학급 중복은 앞선 오류 행을 뺀 행끼리 비교한다. */
function judgeRows(
  rows: ImportRowInput[],
  context: JudgeContext,
): { prepared: PreparedRow[]; verdicts: ImportVerdict[] } {
  const verdicts: ImportVerdict[] = [];
  const prepared: PreparedRow[] = [];
  const firstNameByPhone = new Map<string, string>();

  for (const [index, input] of rows.entries()) {
    const name = input.name.trim();
    const phone = normalizePhone(input.phone);
    const grade = input.grade.trim();
    const className = input.className.trim();
    const group = input.group.trim();
    const row: PreparedRow = {
      index,
      name,
      phone,
      grade,
      className,
      groupId: null,
      classKey: null,
      classId: null,
    };
    prepared.push(row);

    const hasClass = grade !== "" || className !== "";
    const normalizedClass = normalizeClassName(context.orgType, className);
    if (
      name === "" ||
      !/^01[0-9]{8,9}$/.test(phone) ||
      (hasClass &&
        (!GRADES.includes(grade) ||
          className === "" ||
          normalizedClass === "")) ||
      (!hasClass && group !== "")
    ) {
      verdicts.push("format_error");
      continue;
    }

    if (group !== "") {
      const groupId =
        context.orgType === "학교"
          ? undefined
          : context.groups.get(group.toLowerCase());
      if (!groupId) {
        verdicts.push("group_not_registered");
        continue;
      }
      row.groupId = groupId;
    }

    const existing = context.teachersByPhone.get(phone);
    const earlierName = firstNameByPhone.get(phone);
    if (
      (existing && existing.name !== name) ||
      (earlierName !== undefined && earlierName !== name)
    ) {
      verdicts.push("phone_conflict");
      continue;
    }
    if (earlierName === undefined) firstNameByPhone.set(phone, name);

    if (hasClass) {
      row.classKey = classKeyOf(grade, row.groupId, normalizedClass);
      row.classId = context.classIdByKey.get(row.classKey) ?? null;
    }
    verdicts.push("new");
  }

  const seen = new Set<string>();
  for (const row of prepared) {
    if (verdicts[row.index] !== "new" || !row.classKey) continue;
    if (seen.has(row.classKey)) verdicts[row.index] = "class_duplicate";
    else seen.add(row.classKey);
  }

  const personCount = new Map<string, number>();
  const phonesByName = new Map<string, Set<string>>();
  for (const [name, phones] of context.phonesByName) {
    phonesByName.set(name, new Set(phones));
  }
  for (const row of prepared) {
    if (verdicts[row.index] !== "new") continue;
    const key = `${row.name}|${row.phone}`;
    personCount.set(key, (personCount.get(key) ?? 0) + 1);
    phonesByName.set(
      row.name,
      (phonesByName.get(row.name) ?? new Set()).add(row.phone),
    );
  }

  for (const row of prepared) {
    if (verdicts[row.index] !== "new") continue;
    const holder = row.classId
      ? context.holderByClassId.get(row.classId)
      : null;
    if (holder) {
      verdicts[row.index] =
        holder.name === row.name && holder.phone === row.phone
          ? "same"
          : "changed";
    } else if (!row.classKey && context.teachersByPhone.has(row.phone)) {
      verdicts[row.index] = "same";
    } else if ((phonesByName.get(row.name)?.size ?? 0) > 1) {
      verdicts[row.index] = "same_name_other";
    } else if ((personCount.get(`${row.name}|${row.phone}`) ?? 0) > 1) {
      verdicts[row.index] = "shared_login";
    }
  }
  return { prepared, verdicts };
}

interface StoredRun {
  id: string;
  tenant_id: string;
  finished_at: string | null;
  total_rows: number;
  created_count: number;
  updated_count: number;
  account_count: number;
  error_count: number;
  row_results: ImportRowResult[];
}

/** 같은 기관의 끝난 실행이 있으면 저장된 결과. 임시 비밀번호는 저장하지 않으므로 accounts 는 비어 있다. */
function replayOf(run: StoredRun): ImportOutcome {
  return {
    runId: run.id,
    replayed: true,
    counts: {
      total: run.total_rows,
      created: run.created_count,
      updated: run.updated_count,
      accounts: run.account_count,
      errors: run.error_count,
      skipped: run.row_results.filter(
        (r) => r.verdict === "changed" && !r.applied,
      ).length,
    },
    rows: run.row_results,
    accounts: [],
  };
}

export type ImportResult =
  | { status: "ok"; outcome: ImportOutcome }
  | { status: "request_id_in_use" };

/**
 * requestId 로 실행 기록을 먼저 잡는다(unique). 이미 있으면 끝난 실행은 저장된 결과를 돌려주고, 끝나지 않은 실행은
 * 이어서 처리한다(행마다 다시 판정하므로 이미 반영된 행은 동일이 된다). 다른 기관의 requestId 면 request_id_in_use.
 * 순서: 실행 기록 -> 행 판정 -> 등록(T13 경로) -> 감사 로그 -> 실행 기록 완료.
 */
export async function runTeacherImport(
  ctx: ConsoleAuditCtx,
  request: ImportRequest,
): Promise<ImportResult> {
  const admin = ctx.supabaseAdmin;
  const tenantId = ctx.console.tenantId;
  let runId: string = randomUUID();
  const { error: insertError } = await admin
    .from("teacher_import_runs")
    .insert({
      id: runId,
      tenant_id: tenantId,
      request_id: request.requestId,
      actor_profile_id: ctx.userId ?? null,
      proxy_session_id: ctx.console.proxySessionId,
      total_rows: request.rows.length,
    });
  if (insertError) {
    if (insertError.code !== "23505")
      throw new RpcError("teacher_import_runs insert", insertError.code);
    const { data, error } = await admin
      .from("teacher_import_runs")
      .select(
        "id, tenant_id, finished_at, total_rows, created_count, updated_count, account_count, error_count, row_results",
      )
      .eq("request_id", request.requestId)
      .maybeSingle();
    const existing = data as StoredRun | null;
    if (error || !existing)
      throw new RpcError("teacher_import_runs read", error?.code);
    if (existing.tenant_id !== tenantId) return { status: "request_id_in_use" };
    if (existing.finished_at)
      return { status: "ok", outcome: replayOf(existing) };
    runId = existing.id;
  }

  const rowGrades = request.rows
    .map((r) => r.grade.trim())
    .filter((g) => GRADES.includes(g));
  const context = await loadJudgeContext(
    admin,
    tenantId,
    request.rows.map((r) => normalizePhone(r.phone)),
    request.rows.map((r) => r.name.trim()).filter((n) => n !== ""),
    [...new Set(rowGrades)],
  );
  const { prepared, verdicts } = judgeRows(request.rows, context);

  const rows: ImportRowResult[] = verdicts.map((verdict, index) => ({
    index,
    verdict,
    applied:
      verdict === "new" ||
      verdict === "same_name_other" ||
      verdict === "shared_login" ||
      (verdict === "changed" && request.mode === "overwrite"),
  }));

  // 같은 사람(이름과 전화번호)의 행은 한 번의 등록으로 묶어 아이디 하나를 공통으로 쓴다.
  const persons = new Map<string, PreparedRow[]>();
  for (const row of prepared) {
    if (!rows[row.index]?.applied) continue;
    const key = `${row.name}|${row.phone}`;
    persons.set(key, [...(persons.get(key) ?? []), row]);
  }

  const accounts: ImportAccount[] = [];
  let created = 0;
  for (const personRows of persons.values()) {
    const first = personRows[0] as PreparedRow;
    const classes: RegisterInput["classes"] = personRows
      .filter((r) => r.classKey && verdicts[r.index] !== "changed")
      .map((r) => ({
        grade: r.grade,
        name: r.className,
        ...(r.groupId ? { group_id: r.groupId } : {}),
      }));
    const result = await registerTeacherWithAccount(ctx, {
      tenantId,
      name: first.name,
      phone: first.phone,
      role: "homeroom",
      classes,
    });
    if (result.verdict === "created") created++;
    if (result.issued) {
      accounts.push({
        loginId: result.loginId,
        tempPassword: result.issued.tempPassword,
        rowIndexes: personRows.map((r) => r.index),
      });
    }
    for (const r of personRows) {
      if (verdicts[r.index] !== "changed" || !r.classId) continue;
      const { error } = await admin.rpc("fn_teacher_import_move_class", {
        p_class_id: r.classId,
        p_teacher_id: result.teacherId,
      });
      if (error) throw new RpcError("fn_teacher_import_move_class", error.code);
    }
  }

  const changed = rows.filter((r) => r.verdict === "changed");
  const counts = {
    total: rows.length,
    created,
    updated: changed.filter((r) => r.applied).length,
    accounts: accounts.length,
    errors: rows.filter((r) => ERROR_VERDICTS.includes(r.verdict)).length,
    skipped: changed.filter((r) => !r.applied).length,
  };

  await writeConsoleAuditLog(ctx, {
    action: "teacher_import",
    resourceKey: TEACHERS_RESOURCE_KEY,
    targetId: runId,
    rowCount: counts.total,
    meta: {
      created: counts.created,
      updated: counts.updated,
      accounts: counts.accounts,
      errors: counts.errors,
      skipped: counts.skipped,
    },
  });
  const { error: finishError } = await admin
    .from("teacher_import_runs")
    .update({
      created_count: counts.created,
      updated_count: counts.updated,
      account_count: counts.accounts,
      error_count: counts.errors,
      row_results: rows,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (finishError)
    throw new RpcError("teacher_import_runs update", finishError.code);

  return {
    status: "ok",
    outcome: { runId, replayed: false, counts, rows, accounts },
  };
}
