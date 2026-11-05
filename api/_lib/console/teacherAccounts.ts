// 교사 계정 발급 도우미(설계 5.2절 "Teacher issuance sequence").
// 임시 비밀번호는 호출한 쪽에 한 번 돌려줄 뿐 저장하거나 로그에 남기지 않는다. DB 에는 scrypt 해시만 둔다.

import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SYNTHETIC_DOMAIN } from "../auth/login.js";

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
