// 자기평가서 결정론 텍스트 유틸. 모델 호출 없이 글자 수, 문장 수, 상투어 밀도 등을
// 같은 규칙으로 세어 검증, 형식 점검, 승격이 같은 숫자를 쓰게 한다.

import {
  CAUSAL_LINK_PHRASES,
  CLICHES,
  PLAN_EXPRESSIONS,
  PLAN_SENTENCE_END_EXPRESSION,
} from "./dictionaries.js";
import type { CharCount, TargetCharsMode } from "./types.js";

const TERMINATORS = new Set([".", "?", "!"]);
// 여는 부호와 닫는 부호 쌍. 같은 글자(큰따옴표, 작은따옴표)는 토글로 다룬다.
const PAIRED: Record<string, string> = {
  "“": "”",
  "‘": "’",
  "「": "」",
  "『": "』",
};
const TOGGLED = new Set(['"', "'"]);

/**
 * 마침표, 물음표, 느낌표 뒤에 공백이나 문자열 끝이 올 때만 경계로 본다.
 * 그래서 0.71 같은 소수점은 저절로 경계가 아니다. 인용 부호 안은 경계로 보지 않아
 * 학생이 옮겨 적은 문장이 쪼개지지 않게 한다.
 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  let toggled: string | null = null;
  const closers: string[] = [];
  const chars = [...text];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] as string;
    buf += ch;

    if (closers.length > 0) {
      if (ch === closers[closers.length - 1]) closers.pop();
      else if (PAIRED[ch]) closers.push(PAIRED[ch]);
      continue;
    }
    if (toggled !== null) {
      if (ch === toggled) toggled = null;
      continue;
    }
    if (PAIRED[ch]) {
      closers.push(PAIRED[ch]);
      continue;
    }
    if (TOGGLED.has(ch)) {
      toggled = ch;
      continue;
    }
    if (TERMINATORS.has(ch)) {
      const next = chars[i + 1];
      if (next === undefined || /\s/.test(next)) {
        // 연속된 종결 부호(말줄임, ?!)는 한 경계로 묶는다.
        pushTrimmed(out, buf);
        buf = "";
      }
    }
  }
  pushTrimmed(out, buf);
  return out;
}

function pushTrimmed(out: string[], piece: string): void {
  const t = piece.trim();
  if (t !== "") out.push(t);
}

export function countSentences(text: string): number {
  return splitSentences(text).length;
}

export function countChars(text: string): CharCount {
  return {
    withSpace: [...text].length,
    withoutSpace: [...text.replace(/\s/g, "")].length,
  };
}

export function countByMode(text: string, mode: TargetCharsMode): number {
  const c = countChars(text);
  return mode === "with_space" ? c.withSpace : c.withoutSpace;
}

// 단위가 붙은 수("10일", "3개"), 퍼센트, 천단위 쉼표, 소수를 한 토큰으로 잡는다.
// 조사까지 딸려 오지 않도록 단위는 자주 쓰는 목록으로만 붙인다.
const UNITS =
  "시간|분|초|개월|일|주|달|년|월|개|명|회|건|점|배|번|권|쪽|차례|세트|곳|가지|문항|문제|장|편";
const NUMBER_PATTERN = new RegExp(
  `\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?%?(?:${UNITS})?|\\d+(?:\\.\\d+)?%?(?:${UNITS})?`,
  "g",
);

/** 중복 제거는 하지 않는다. 같은 수를 두 번 쓴 것도 근거 수로 센다. */
export function extractNumbers(text: string): string[] {
  return text.match(NUMBER_PATTERN) ?? [];
}

export function clicheDensity(
  text: string,
  mode: TargetCharsMode,
): { density: number; hits: string[] } {
  const hits: string[] = [];
  for (const word of CLICHES) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(word, from);
      if (at === -1) break;
      hits.push(word);
      from = at + word.length;
    }
  }
  const len = countByMode(text, mode);
  if (len === 0) return { density: 0, hits };
  return { density: Math.round((hits.length / len) * 1000 * 100) / 100, hits };
}

const PLAN_SENTENCE_END = new RegExp(
  `${PLAN_SENTENCE_END_EXPRESSION.replace(/\s/g, "\\s*")}$`,
);

/**
 * 본문에서 찾은 계획 표현. 공백을 지우고 비교하고 사전 원문을 사전 순서로, 중복 없이 돌려준다.
 * 문장이 "고자 함" 으로 끝나면(끝 공백과 마지막 문장부호는 무시) 사전 표현 뒤에 "고자 함" 을 붙인다.
 */
export function findPlanExpressions(text: string): string[] {
  const compact = text.replace(/\s/g, "");
  const hits = PLAN_EXPRESSIONS.filter((p) =>
    compact.includes(p.replace(/\s/g, "")),
  );
  const endsWithPurpose = splitSentences(text).some((s) =>
    PLAN_SENTENCE_END.test(s.replace(/[\s.?!]+$/, "")),
  );
  return endsWithPurpose ? [...hits, PLAN_SENTENCE_END_EXPRESSION] : hits;
}

/** 본문에서 찾은 인과 연계 표현(명세 No.193). 공백을 지우고 비교하고 사전 원문으로 돌려준다. */
export function findCausalLinkPhrases(text: string): string[] {
  const compact = text.replace(/\s/g, "");
  return CAUSAL_LINK_PHRASES.filter((p) =>
    compact.includes(p.replace(/\s/g, "")),
  );
}

/**
 * 대학명 비교용 정규형. 공백을 없애고 끝의 대학교, 대학, 대를 한 번만 뗀다.
 * "서울대", "서울대학교", "서울 대학교" 가 같은 "서울" 이 되게 하려는 것이다.
 */
export function normalizeUniversity(name: string): string {
  return name.replace(/\s/g, "").replace(/(대학교|대학|대)$/, "");
}

/** 본문에 학생이 적은 대학명이 들어 있으면 그 이름(입력 그대로)을, 없으면 null. */
export function containsUniversity(
  text: string,
  universities: string[],
): string | null {
  const body = text.replace(/\s/g, "");
  for (const name of universities) {
    const key = normalizeUniversity(name);
    if (key !== "" && body.includes(key)) return name;
  }
  return null;
}

// 길이가 긴 조사부터 맞춰야 "에서" 가 "서" 로 잘못 떨어지지 않는다.
const PARTICLES = [
  "에서",
  "으로",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "의",
  "에",
  "로",
  "와",
  "과",
  "도",
];

/** 어절 끝의 흔한 조사를 한 번 뗀다. 조사가 없으면 그대로. */
export function stripParticle(word: string): string {
  for (const p of PARTICLES) {
    if (word.endsWith(p)) return word.slice(0, -p.length);
  }
  return word;
}

/**
 * 한글 어절에서 흔한 조사를 한 번 떼고 minLength 이상만 등장 순으로 중복 없이 돌려준다.
 * 형태소 분석기를 쓰지 않는 근사치라서 키워드 후보를 거르는 용도로만 쓴다.
 */
export function extractKeywords(text: string, minLength = 2): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const word of text.match(/[가-힣]+/g) ?? []) {
    const stem = stripParticle(word);
    if ([...stem].length < minLength || seen.has(stem)) continue;
    seen.add(stem);
    out.push(stem);
  }
  return out;
}

const MARKDOWN_PATTERNS: readonly RegExp[] = [
  /^\s*(?:#{1,6}\s|[-*]\s|\d+\.\s)/m,
  /\*\*/,
  /`/,
  /\[[^\]]+\]\([^)]+\)/,
];

/** 생성 본문에 마크다운 문법이 섞였는지. 학생 제출용 평문이어야 한다. */
export function hasMarkdown(text: string): boolean {
  return MARKDOWN_PATTERNS.some((p) => p.test(text));
}

const CLOSING_MARKS = /[\s"'\u201d\u2019)\]」』]+$/;

/**
 * 문장 끝에 . ? ! 가 없으면 마침표를 붙인다(명세 No.56 문장 수는 이 부호로 센다). 끝의 공백과
 * 닫는 따옴표는 부호 판단에서 무시하고, 마침표는 맨 끝에 붙인다. 모델이 "~함" 문장을 부호 없이
 * 돌려줘도 저장 문장이 한 문장씩으로 세어지게 하는 결정론 보정이다.
 */
export function ensureTerminalPunctuation(text: string): string {
  const t = text.trimEnd();
  if (t === "") return t;
  const core = t.replace(CLOSING_MARKS, "");
  return TERMINATORS.has(core.slice(-1)) ? t : `${t}.`;
}

/**
 * 본문 문체는 "~함" 한 가지다(명세 No.11, No.52). 기록의 "하였음", "했음" 서술을 "함"으로
 * 맞춘다. 예: "통제하지 못하였음" 은 "통제하지 못함". 어절 끝에서만 바꾼다.
 */
export function normalizeNominalEndings(text: string): string {
  return text.replace(/(?:하였음|했음)(?=[\s.,!?;:)\]"'」』]|$)/g, "함");
}
