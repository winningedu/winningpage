// 교사 계정 발급 도우미(설계 5.2절 "Teacher issuance sequence").
// 임시 비밀번호는 호출한 쪽에 한 번 돌려줄 뿐 저장하거나 로그에 남기지 않는다. DB 에는 scrypt 해시만 둔다.

import { randomInt } from "node:crypto";

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
