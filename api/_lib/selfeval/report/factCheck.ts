// 리포트 문장 사실 대조(명세 No.139). 성장설계 V1 에는 따로 재사용할 대조 모듈이 없어 같은 취지를
// 결정론으로 새로 둔다: 숫자는 근거 원문에 있어야 하고, 인용은 원문 그대로이며 상한 이내여야 하고,
// 꼬리표와 문장 번호는 그 항목에 속한 것만 쓴다. 행동과 감정의 지어내기는 숫자와 인용 대조로 줄이고
// 순서 바꿈은 번호와 라벨을 코드 값이 이기므로 따로 막지 않는다.

import { extractNumbers } from "../text.js";
import type { StepIssue } from "../types.js";
import type { ComposeNeed } from "./needs.js";

const MAX_TEXT_CHARS = 160;
const BANNED = /[\u00b7\u2014\u2013\u2192\u2190\u21d2]/;
const TAG = /(?<![A-Za-z])[PDAH]\d+/g;
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
// 큰따옴표, 둥근 큰따옴표, 낫표, 둥근 작은따옴표 쌍.
const QUOTE_PATTERNS: readonly RegExp[] = [
  /"([^"]+)"/g,
  /\u201c([^\u201d]+)\u201d/g,
  /\u300c([^\u300d]+)\u300d/g,
  /\u2018([^\u2019]+)\u2019/g,
];

export type ComposeVerdict =
  | { ok: true; texts: Record<string, string> }
  | { ok: false; issues: StepIssue[] };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function checkOne(n: ComposeNeed, text: string): StepIssue[] {
  const issue = (code: string, message: string): StepIssue => ({
    code,
    message,
    path: n.id,
  });
  const issues: StepIssue[] = [];
  const trimmed = text.trim();
  if (trimmed === "") return [issue("empty_text", "문장이 비어 있습니다.")];
  if ([...trimmed].length > MAX_TEXT_CHARS) {
    issues.push(issue("too_long", `문장이 ${MAX_TEXT_CHARS}자를 넘습니다.`));
  }
  if (BANNED.test(trimmed)) {
    issues.push(
      issue(
        "banned_char",
        "가운뎃점, 긴 줄표, 화살표는 쓰지 않습니다. 쉼표와 낱말로 씁니다.",
      ),
    );
  }
  const haystack = n.sources.join(" ");

  const tags = trimmed.match(TAG) ?? [];
  for (const t of new Set(tags)) {
    if (!n.allowedTags.includes(t)) {
      issues.push(
        issue("unknown_tag", `${t} 꼬리표는 이 항목에 속하지 않습니다.`),
      );
    }
  }
  if (n.requiredTag !== undefined && !tags.includes(n.requiredTag)) {
    issues.push(
      issue(
        "missing_tag",
        `근거 꼬리표 ${n.requiredTag}를 문장에 적어야 합니다.`,
      ),
    );
  }
  for (const ch of new Set([...trimmed].filter((c) => CIRCLED.includes(c)))) {
    if (!n.allowedNumbers.includes(CIRCLED.indexOf(ch) + 1)) {
      issues.push(
        issue(
          "bad_sentence_number",
          `문장 번호 ${ch}는 이 항목과 이어지지 않습니다.`,
        ),
      );
    }
  }
  const numbers = extractNumbers(trimmed.replace(TAG, " "));
  for (const num of new Set(numbers)) {
    if (!haystack.includes(num)) {
      issues.push(
        issue(
          "number_not_in_source",
          `${num} 은(는) 근거 기록 원문에 없는 숫자입니다.`,
        ),
      );
    }
  }
  for (const pattern of QUOTE_PATTERNS) {
    for (const m of trimmed.matchAll(pattern)) {
      const quoted = m[1] as string;
      if (!haystack.includes(quoted)) {
        issues.push(
          issue(
            "quote_not_in_source",
            `인용 "${quoted}" 이(가) 근거 원문에 그대로 있지 않습니다.`,
          ),
        );
      } else if ([...quoted].length > n.maxQuote) {
        issues.push(
          issue(
            "quote_too_long",
            `인용은 ${n.maxQuote}자 이내여야 합니다: "${quoted}"`,
          ),
        );
      }
    }
  }
  return issues;
}

/** 모델 응답 { items: [{ id, text }] } 을 항목별로 대조한다. 필요한 항목이 빠지면 문제다. */
export function validateCompose(
  raw: unknown,
  needs: ComposeNeed[],
): ComposeVerdict {
  if (!isRecord(raw) || !Array.isArray(raw.items)) {
    return {
      ok: false,
      issues: [{ code: "invalid_shape", message: "items 배열이 없습니다." }],
    };
  }
  const given = new Map<string, string>();
  for (const x of raw.items) {
    if (isRecord(x) && typeof x.id === "string" && typeof x.text === "string") {
      given.set(x.id, x.text);
    }
  }
  const issues: StepIssue[] = [];
  const texts: Record<string, string> = {};
  for (const n of needs) {
    const text = given.get(n.id);
    if (text === undefined) {
      issues.push({
        code: "missing_item",
        message: "이 항목의 문장이 없습니다.",
        path: n.id,
      });
      continue;
    }
    const found = checkOne(n, text);
    if (found.length > 0) issues.push(...found);
    else texts[n.id] = text.trim();
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, texts };
}
