// 교사 계정 발급 도우미(설계 5.2절 "Teacher issuance sequence").
// 임시 비밀번호는 호출한 쪽에 한 번 돌려줄 뿐 저장하거나 로그에 남기지 않는다. DB 에는 scrypt 해시만 둔다.

import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelResponse } from "@vercel/node";
import { MAX_PASSWORD_LENGTH, SYNTHETIC_DOMAIN } from "../auth/login.js";
import { sendError } from "../httpResponse.js";
import { type ConsoleAuditCtx, writeConsoleAuditLog } from "./audit.js";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^*-_+=?";
const TEMP_PASSWORD_LENGTH = 10;

function pick(chars: string): string {
  return chars[randomInt(chars.length)] as string;
}

/** 영문자, 숫자, 기호를 각각 하나 이상 포함한 10자(사 #119). 헷갈리는 글자(0, O, 1, l, I)는 뺀다. */
export function generateTempPassword(): string {
  const all = LETTERS + DIGITS + SYMBOLS;
  const chars = [pick(LETTERS), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < TEMP_PASSWORD_LENGTH) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }
  return chars.join("");
}

// 임시 비밀번호는 무작위 10자이고 수명이 짧아(첫 로그인 때 바뀐다) 비용을 OWASP 최소(N=2^17)보다 낮춘 2^15 로 둔다.
// 서버리스 메모리를 아끼려는 선택이다. 값은 해시 문자열에 같이 저장해 나중에 올려도 옛 해시가 검증된다.
const SCRYPT_N = 2 ** 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const SCRYPT_MAXMEM = 128 * SCRYPT_N * SCRYPT_R * 2;

/** `scrypt$N$r$p$salt(base64)$hash(base64)`. */
export async function hashTempPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

/** 형식이 깨진 저장값은 예외 없이 false. */
export async function verifyTempPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  try {
    const actual = await scryptAsync(
      password,
      Buffer.from(salt, "base64"),
      expected.length,
      {
        N: Number(n),
        r: Number(r),
        p: Number(p),
        maxmem: 128 * Number(n) * Number(r) * 2,
      },
    );
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** 로그인 아이디의 Auth 이메일(설계 P1). 화면에 보이지 않고 입력으로도 받지 않는다. */
export function syntheticEmail(loginId: string): string {
  return `${loginId.toLowerCase()}@${SYNTHETIC_DOMAIN}`;
}

const LIST_PAGE_SIZE = 1000;

// createUser 가 email_exists 로 실패했을 때만 쓴다(발급 도중 끊긴 뒤 재시도). Auth 에는 이메일 단건 조회가 없어 훑는다.
async function findAuthUserIdByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: LIST_PAGE_SIZE,
    });
    if (error) throw new Error("teacher auth user lookup failed");
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found.id;
    if (data.users.length === 0) return null;
  }
}

/**
 * 합성 이메일로 확인된 Auth 사용자를 만든다. 같은 로그인 아이디는 같은 이메일이라 재시도해도 하나뿐이다.
 * 이미 있으면(앞선 시도가 DB 연결 전에 끊김) 그 사용자의 비밀번호를 이번 임시 비밀번호로 맞춰 돌려준다.
 */
export async function ensureAuthUser(
  admin: SupabaseClient,
  loginId: string,
  tempPassword: string,
): Promise<string> {
  const email = syntheticEmail(loginId);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });
  if (!error && data.user) return data.user.id;
  if (error?.code !== "email_exists") {
    throw new Error("teacher auth user create failed");
  }

  const existingId = await findAuthUserIdByEmail(admin, email);
  if (!existingId) throw new Error("teacher auth user create failed");
  const { error: updateError } = await admin.auth.admin.updateUserById(
    existingId,
    { password: tempPassword },
  );
  if (updateError) throw new Error("teacher auth user password sync failed");
  return existingId;
}

/** DB 함수 실패. code 는 SQLSTATE(WC0xx, 23505 등)라 라우트가 코드별 응답으로 바꾼다. */
export class RpcError extends Error {
  constructor(
    fn: string,
    readonly code: string | undefined,
  ) {
    super(`${fn} failed`);
  }
}

export interface IssuedAccount {
  profileId: string;
  /** 한 번만 돌려주고 저장하거나 로그에 남기지 않는다. */
  tempPassword: string;
  /** 알림톡 발송 중복 방지 열쇠(설계 5.2절 4번). */
  dedupeKey: string;
}

/**
 * 임시 비밀번호를 만들고 Auth 사용자(없으면 생성)를 연결한다. DB 행은 이미 있어야 하고(fn_teacher_register),
 * Auth 쪽 호출은 DB 변경 뒤에 한다. 재시도해도 같은 합성 이메일이라 사용자가 둘이 되지 않는다.
 */
export async function issueTeacherAccount(
  admin: SupabaseClient,
  teacherId: string,
  loginId: string,
): Promise<IssuedAccount> {
  const tempPassword = generateTempPassword();
  const profileId = await ensureAuthUser(admin, loginId, tempPassword);
  const { error } = await admin.rpc("fn_teacher_attach_account", {
    p_teacher_id: teacherId,
    p_profile_id: profileId,
    p_login_id: loginId,
    p_temp_hash: await hashTempPassword(tempPassword),
  });
  if (error) throw new RpcError("fn_teacher_attach_account", error.code);

  return {
    profileId,
    tempPassword,
    dedupeKey: await readIssueDedupeKey(admin, teacherId),
  };
}

/** 방금 attach 한 임시 비밀번호 발급 시각으로 발송 중복 방지 열쇠를 만든다. */
export async function readIssueDedupeKey(
  admin: SupabaseClient,
  teacherId: string,
): Promise<string> {
  const { data, error } = await admin
    .from("teachers")
    .select("temp_password_issued_at")
    .eq("id", teacherId)
    .maybeSingle();
  if (error || !data) throw new RpcError("teacher issued_at read", error?.code);
  return `teacherIssue:${teacherId}:${data.temp_password_issued_at}`;
}

export const TEACHERS_RESOURCE_KEY = "console.teachers";

export interface RegisterInput {
  tenantId: string;
  name: string;
  /** 숫자만(01012345678). */
  phone: string;
  role: "homeroom" | "school_admin";
  classes: { grade: string; name: string; group_id?: string | undefined }[];
}

export interface RegisterResult {
  teacherId: string;
  loginId: string;
  verdict: string;
  /** 이번 호출에서 계정을 새로 만들었거나 임시 비밀번호를 다시 준 경우에만 있다. */
  issued: IssuedAccount | null;
}

/**
 * 등록(같은 사람이면 학급만 추가 또는 승격) 뒤 계정이 없으면 발급하고 감사 로그를 남긴다.
 * 순서: DB 등록(한 트랜잭션) -> Auth 사용자 -> attach -> 감사 로그. 계정이 이미 있는 같은 사람은 계정을 건드리지 않는다.
 * 감사 로그 적재가 실패하면 예외가 나므로 남기지 못한 발급은 성공으로 끝나지 않는다.
 */
export async function registerTeacherWithAccount(
  ctx: ConsoleAuditCtx,
  input: RegisterInput,
): Promise<RegisterResult> {
  const admin = ctx.supabaseAdmin;
  const { data, error } = await admin.rpc("fn_teacher_register", {
    p_tenant_id: input.tenantId,
    p_name: input.name,
    p_phone: input.phone,
    p_role: input.role,
    p_classes: input.classes,
    p_actor: ctx.userId ?? null,
  });
  const registered = (
    data as { teacher_id: string; verdict: string }[] | null
  )?.[0];
  if (error || !registered)
    throw new RpcError("fn_teacher_register", error?.code);

  const { data: teacher, error: readError } = await admin
    .from("teachers")
    .select("login_id, profile_id")
    .eq("id", registered.teacher_id)
    .maybeSingle();
  if (readError || !teacher?.login_id) {
    throw new RpcError("teacher read", readError?.code);
  }

  const issued = teacher.profile_id
    ? null
    : await issueTeacherAccount(admin, registered.teacher_id, teacher.login_id);

  await writeConsoleAuditLog(ctx, {
    action: issued ? "account_issue" : "update",
    resourceKey: TEACHERS_RESOURCE_KEY,
    targetId: registered.teacher_id,
    meta: {
      verdict: registered.verdict,
      loginId: teacher.login_id,
      role: input.role,
      ...(issued ? { sendDedupeKey: issued.dedupeKey } : {}),
    },
  });

  return {
    teacherId: registered.teacher_id,
    loginId: teacher.login_id,
    verdict: registered.verdict,
    issued,
  };
}

const DB_ERRORS: Record<
  string,
  { status: number; code: string; message: string }
> = {
  WC075: {
    status: 409,
    code: "PHONE_IN_USE",
    message: "다른 이름의 선생님이 이미 쓰는 전화번호입니다.",
  },
  P0002: {
    status: 404,
    code: "TENANT_NOT_FOUND",
    message: "기관을 찾을 수 없습니다.",
  },
  WC076: {
    status: 409,
    code: "LAST_SCHOOL_ADMIN",
    message:
      "학교 관리자가 1명뿐이라 바꿀 수 없습니다. 다른 관리자를 먼저 지정해 주세요.",
  },
  WC088: {
    status: 404,
    code: "NOT_FOUND",
    message: "대상을 찾을 수 없습니다.",
  },
  WC091: {
    status: 409,
    code: "SELF_CHANGE",
    message: "본인 계정의 상태는 바꿀 수 없습니다.",
  },
  WC092: {
    status: 409,
    code: "LAST_CLASS_REQUIRED",
    message: "담임 선생님은 담당 학급이 하나 이상 있어야 합니다.",
  },
  WC093: {
    status: 400,
    code: "PRIMARY_NOT_ASSIGNED",
    message: "주담당으로 지정할 학급이 배정되어 있지 않습니다.",
  },
  "23505": {
    status: 409,
    code: "CLASS_TAKEN",
    message: "다른 선생님이 이미 담임인 학급입니다.",
  },
};

/** DB 함수가 규칙 위반으로 낸 에러면 코드별 응답을 보내고 true. 그 밖의 에러는 false(호출부가 다시 던진다). */
export function sendTeacherDbError(
  res: VercelResponse,
  error: unknown,
): boolean {
  if (!(error instanceof RpcError) || !error.code) return false;
  const mapped = DB_ERRORS[error.code];
  if (!mapped) return false;
  sendError(res, "coded", mapped.status, mapped.message, mapped.code);
  return true;
}

export interface ParsedRegisterBody {
  name: string;
  phone: string;
  classes: RegisterInput["classes"];
}

/** 학급 목록(생략하면 빈 목록). 배열이 아니거나 학년, 이름이 비면 null. */
export function parseClassRows(
  classes: unknown,
): RegisterInput["classes"] | null {
  if (classes === undefined) return [];
  if (!Array.isArray(classes)) return null;
  const parsed: RegisterInput["classes"] = [];
  for (const row of classes as Record<string, unknown>[]) {
    if (typeof row?.grade !== "string" || typeof row?.name !== "string")
      return null;
    if (row.grade === "" || row.name.trim() === "") return null;
    parsed.push({
      grade: row.grade,
      name: row.name,
      ...(typeof row.groupId === "string" ? { group_id: row.groupId } : {}),
    });
  }
  return parsed;
}

/** 이름, 전화번호(숫자만으로 정규화, 01 로 시작 10 또는 11자리), 학급 목록(생략 가능)을 검증한다. */
export function parseRegisterBody(body: unknown): ParsedRegisterBody | null {
  const { name, phone, classes } = (body ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || name.trim() === "") return null;
  if (typeof phone !== "string") return null;
  const digits = phone.replace(/\D/g, "");
  if (!/^01[0-9]{8,9}$/.test(digits)) return null;
  const parsed = parseClassRows(classes);
  if (!parsed) return null;
  return { name: name.trim(), phone: digits, classes: parsed };
}

export type IssueExistingResult =
  | { status: "not_found" }
  | { status: "account_exists" }
  | { status: "issued"; loginId: string; issued: IssuedAccount };

/**
 * 이미 등록된 교사(계정 없음)에게 계정을 발급한다(W16b). 다른 기관이거나 삭제된 교사는 not_found 로
 * 존재 여부를 숨기고, 계정이 이미 있으면 account_exists(재발급은 별도 라우트)다.
 */
export async function issueAccountForExistingTeacher(
  ctx: ConsoleAuditCtx,
  teacherId: string,
): Promise<IssueExistingResult> {
  const admin = ctx.supabaseAdmin;
  const { data: teacher, error } = await admin
    .from("teachers")
    .select("tenant_id, login_id, profile_id, deleted_at")
    .eq("id", teacherId)
    .maybeSingle();
  if (error) throw new RpcError("teacher read", error.code);
  if (
    !teacher ||
    teacher.deleted_at ||
    teacher.tenant_id !== ctx.console.tenantId ||
    !teacher.login_id
  ) {
    return { status: "not_found" };
  }
  if (teacher.profile_id) return { status: "account_exists" };

  const issued = await issueTeacherAccount(admin, teacherId, teacher.login_id);
  await writeConsoleAuditLog(ctx, {
    action: "account_issue",
    resourceKey: TEACHERS_RESOURCE_KEY,
    targetId: teacherId,
    meta: { loginId: teacher.login_id, sendDedupeKey: issued.dedupeKey },
  });
  return { status: "issued", loginId: teacher.login_id, issued };
}

/** 등록 응답 본문. 임시 비밀번호는 이번에 새로 발급한 경우에만 싣는다. */
export function registerResponseBody(result: RegisterResult) {
  return {
    ok: true,
    teacherId: result.teacherId,
    loginId: result.loginId,
    verdict: result.verdict,
    ...(result.issued ? { tempPassword: result.issued.tempPassword } : {}),
  };
}

export type PasswordRuleViolation =
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_TOO_LONG"
  | "PASSWORD_NO_LETTER"
  | "PASSWORD_NO_DIGIT";

export const PASSWORD_RULE_MESSAGES: Record<PasswordRuleViolation, string> = {
  PASSWORD_TOO_SHORT: "비밀번호는 8자 이상이어야 합니다.",
  PASSWORD_TOO_LONG: "비밀번호가 너무 깁니다.",
  PASSWORD_NO_LETTER: "비밀번호에 영문자를 포함해 주세요.",
  PASSWORD_NO_DIGIT: "비밀번호에 숫자를 포함해 주세요.",
};

/** W2 규칙: 8자 이상, 영문자와 숫자를 모두 포함. 위반이 없으면 null. */
export function checkNewPassword(
  password: string,
): PasswordRuleViolation | null {
  if (password.length < 8) return "PASSWORD_TOO_SHORT";
  if (password.length > MAX_PASSWORD_LENGTH) return "PASSWORD_TOO_LONG";
  if (!/[A-Za-z]/.test(password)) return "PASSWORD_NO_LETTER";
  if (!/[0-9]/.test(password)) return "PASSWORD_NO_DIGIT";
  return null;
}
