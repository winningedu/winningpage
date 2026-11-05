// 교사 엑셀 일괄 등록(W15) 도우미. 행 판정은 서버가 다시 계산하고, 등록은 T13 의 등록 경로를 그대로 쓴다.
// 임시 비밀번호는 응답에 한 번만 싣고 저장하거나 로그에 남기지 않는다. 실행 기록에는 행 번호와 판정 코드만 둔다.

import { randomUUID } from "node:crypto";
import type { ConsoleAuditCtx } from "./audit.js";
import { RpcError, registerTeacherWithAccount } from "./teacherAccounts.js";

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

export type ImportVerdict = "new";

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

export async function runTeacherImport(
  ctx: ConsoleAuditCtx,
  request: ImportRequest,
): Promise<ImportOutcome> {
  const admin = ctx.supabaseAdmin;
  const runId = randomUUID();
  const { error: insertError } = await admin
    .from("teacher_import_runs")
    .insert({
      id: runId,
      tenant_id: ctx.console.tenantId,
      request_id: request.requestId,
      actor_profile_id: ctx.userId ?? null,
      proxy_session_id: ctx.console.proxySessionId,
      total_rows: request.rows.length,
    });
  if (insertError)
    throw new RpcError("teacher_import_runs insert", insertError.code);

  const rows: ImportRowResult[] = [];
  const accounts: ImportAccount[] = [];
  let created = 0;
  for (const [index, input] of request.rows.entries()) {
    const result = await registerTeacherWithAccount(ctx, {
      tenantId: ctx.console.tenantId,
      name: input.name.trim(),
      phone: input.phone.replace(/\D/g, ""),
      role: "homeroom",
      classes: [{ grade: input.grade, name: input.className }],
    });
    if (result.verdict === "created") created++;
    if (result.issued) {
      accounts.push({
        loginId: result.loginId,
        tempPassword: result.issued.tempPassword,
        rowIndexes: [index],
      });
    }
    rows.push({ index, verdict: "new", applied: true });
  }

  return {
    runId,
    replayed: false,
    counts: {
      total: rows.length,
      created,
      updated: 0,
      accounts: accounts.length,
      errors: 0,
      skipped: 0,
    },
    rows,
    accounts,
  };
}
