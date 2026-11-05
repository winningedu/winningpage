// 교사 계정 발급 도우미(설계 5.2절 "Teacher issuance sequence").
// 임시 비밀번호는 호출한 쪽에 한 번 돌려줄 뿐 저장하거나 로그에 남기지 않는다. DB 에는 scrypt 해시만 둔다.

import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

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
