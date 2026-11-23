// report_compose: finalize 뒤 모델 1회 호출로 리포트 문장을 한꺼번에 만든다(명세 No.138).
// 이용 횟수는 차감하지 않고 selfeval_report_views.attempts 가 센다(상한 10, No.17).
// 응답 검증(사실 대조)에 걸리면 문제 목록을 붙여 1회 재요청하고, 다시 걸리면 호출자가
// 코드 값만으로 리포트를 만든다(No.201).

import type { callStructured } from "../../ai/gemini.js";
import type { AiTrace } from "../../ai/telemetry/trace.js";
import { buildRetryNotes, type PromptBundle } from "../prompts.js";
import { MAX_MODEL_ATTEMPTS_PER_STEP } from "../types.js";
import { parseModelJson } from "../validation.js";
import { MAX_TEXT_CHARS, validateCompose } from "./factCheck.js";
import type { ComposeNeed } from "./needs.js";

const MAX_OUTPUT_TOKENS = 8192;
/** 요청 한 번에서 모델을 부르는 최대 횟수. 첫 시도와 재요청 1회. */
const MAX_TRIES = 2;

const responseSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, text: { type: "string" } },
        required: ["id", "text"],
      },
    },
  },
  required: ["items"],
};

const SYSTEM = [
  "너는 학생의 자기평가서 리포트에 들어갈 설명 문장을 쓴다.",
  "- 항목마다 주어진 근거 원문에 있는 내용만 쓴다. 원문에 없는 행동, 숫자, 감정을 만들지 않고 순서를 바꾸지 않는다.",
  "- 숫자는 근거 원문에 있는 그대로만 쓴다. 번호, 목록, 라벨, 비율은 코드가 정하므로 만들지 않는다.",
  `- 항목마다 쓰는 문장은 1~2문장이고 공백 포함 ${MAX_TEXT_CHARS}자 이내로 쓴다. 넘으면 그 항목은 버려진다.`,
  "- 직접 인용은 근거 원문에 그대로 있는 구절만 큰따옴표로 감싸고 길이 상한을 지킨다. 기록과 메모 인용은 30자 이내, 관계 설명 인용은 15자 이내다.",
  "- 꼬리표(P1, D1, H1 등)와 문장 번호(①)는 항목에 주어진 것만 쓴다.",
  "- 문체는 ~함, ~했음, ~입니다 중 한 가지로 간결하게 쓴다. 가운뎃점, 긴 줄표, 화살표는 쓰지 않는다.",
  "- 응답은 items 배열이고 항목마다 id 와 text 를 그대로 돌려준다.",
].join("\n");

export function buildComposePrompt(
  needs: ComposeNeed[],
  retryNotes: string[],
): PromptBundle {
  const items = needs
    .map(
      (n) =>
        `[${n.id}]\n지시: ${n.instruction}\n근거 원문:\n${n.sources.map((s) => `- ${s}`).join("\n")}\n직접 인용 상한: ${n.maxQuote}자`,
    )
    .join("\n\n");
  const retry =
    retryNotes.length === 0
      ? ""
      : `\n\n[이전 응답의 문제]\n${retryNotes.map((n) => `- ${n}`).join("\n")}`;
  return {
    system: SYSTEM,
    user: `아래 항목마다 문장을 쓴다.\n\n${items}${retry}`,
    responseSchema,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  };
}

export type ComposeOutcome =
  | { kind: "ok"; texts: Record<string, string>; attempts: number }
  | { kind: "invalid"; attempts: number }
  | { kind: "upstream"; attempts: number }
  | { kind: "exhausted"; attempts: number };

export async function composeTexts(args: {
  needs: ComposeNeed[];
  /** 이 리포트에서 이미 센 모델 호출 횟수. */
  attemptsSoFar: number;
  callStructured: typeof callStructured;
  trace?: AiTrace | undefined;
  signal?: AbortSignal | undefined;
}): Promise<ComposeOutcome> {
  if (args.needs.length === 0) return { kind: "ok", texts: {}, attempts: 0 };
  let attempts = 0;
  let retryNotes: string[] = [];
  // 한 응답에서 자기 검사를 통과한 항목은 재요청에서 깨져도 남긴다(No.137, 138).
  const kept: Record<string, string> = {};
  const finish = (): ComposeOutcome =>
    Object.keys(kept).length > 0
      ? { kind: "ok", texts: kept, attempts }
      : { kind: "invalid", attempts };
  for (let i = 0; i < MAX_TRIES; i++) {
    if (args.attemptsSoFar + attempts >= MAX_MODEL_ATTEMPTS_PER_STEP) {
      return attempts === 0 ? { kind: "exhausted", attempts } : finish();
    }
    const bundle = buildComposePrompt(args.needs, retryNotes);
    attempts++;
    args.trace?.beginAttempt(i === 0 ? null : "retry");
    let reply: { text: string; finishReason: string | null };
    try {
      reply = await args.callStructured(bundle.system, bundle.user, {
        responseMimeType: "application/json",
        responseSchema: bundle.responseSchema as never,
        maxOutputTokens: bundle.maxOutputTokens,
        ...(args.signal === undefined ? {} : { abortSignal: args.signal }),
        ...(args.trace === undefined ? {} : { telemetry: args.trace }),
      });
    } catch (e) {
      console.error("selfeval report_compose 모델 호출 실패:", e);
      return { kind: "upstream", attempts };
    }
    const parsed = parseModelJson(reply.text, reply.finishReason);
    const verdict = parsed.ok
      ? validateCompose(parsed.value, args.needs)
      : { ok: false as const, issues: [parsed.issue], texts: {} };
    for (const [id, text] of Object.entries(verdict.texts)) {
      kept[id] ??= text;
    }
    if (verdict.ok) {
      args.trace?.annotateLastCall({ validation: "ok" });
      return { kind: "ok", texts: kept, attempts };
    }
    args.trace?.annotateLastCall({
      validation: "failed",
      issueCodes: verdict.issues.map((x) => x.code),
    });
    retryNotes = buildRetryNotes(verdict.issues);
  }
  return finish();
}
