// 교사 엑셀 일괄 등록(W15) 도우미. 행 판정은 서버가 다시 계산하고, 등록은 T13 의 등록 경로를 그대로 쓴다.
// 임시 비밀번호는 응답에 한 번만 싣고 저장하거나 로그에 남기지 않는다. 실행 기록에는 행 번호와 판정 코드만 둔다.

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsoleAuditCtx } from "./audit.js";
import {
  type RegisterInput,
  RpcError,
  registerTeacherWithAccount,
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
  | "new";

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
}

async function loadJudgeContext(
  admin: SupabaseClient,
  tenantId: string,
  phones: string[],
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
      row.classKey = `${grade}|${row.groupId ?? ""}|${normalizedClass.toLowerCase()}`;
    }
    verdicts.push("new");
  }

  const seen = new Set<string>();
  for (const row of prepared) {
    if (verdicts[row.index] !== "new" || !row.classKey) continue;
    if (seen.has(row.classKey)) verdicts[row.index] = "class_duplicate";
    else seen.add(row.classKey);
  }
  return { prepared, verdicts };
}

export async function runTeacherImport(
  ctx: ConsoleAuditCtx,
  request: ImportRequest,
): Promise<ImportOutcome> {
  const admin = ctx.supabaseAdmin;
  const tenantId = ctx.console.tenantId;
  const runId = randomUUID();
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
  if (insertError)
    throw new RpcError("teacher_import_runs insert", insertError.code);

  const context = await loadJudgeContext(
    admin,
    tenantId,
    request.rows.map((r) => normalizePhone(r.phone)),
  );
  const { prepared, verdicts } = judgeRows(request.rows, context);

  const rows: ImportRowResult[] = verdicts.map((verdict, index) => ({
    index,
    verdict,
    applied: verdict === "new",
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
      .filter((r) => r.classKey)
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
  }

  const errors = rows.filter((r) => !r.applied).length;
  return {
    runId,
    replayed: false,
    counts: {
      total: rows.length,
      created,
      updated: 0,
      accounts: accounts.length,
      errors,
      skipped: 0,
    },
    rows,
    accounts,
  };
}
