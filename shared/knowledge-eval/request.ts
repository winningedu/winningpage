// 지식 검색 품질 평가 실행(POST /api/admin/knowledge-eval)의 요청 스키마. 값 규칙과 한국어 사유는 여기서 정한다.
// 운영값(지식 유형별 matchThreshold 등)은 서버에만 있어, 이 스키마는 덮어쓸 값만 읽고 운영값과 합치는 일은 서버가 한다.
// 실패 사유는 400 VALIDATION_FAILED 의 errors[0].message 로 나간다.

import { z } from "zod";
import { EVAL_MODES, KNOWLEDGE_TYPES } from "./contract.js";

/** 조합 비교 한 번에 돌리는 조합 수 상한. */
export const SWEEP_MAX_COMBOS = 24;

/** 메모 길이 상한. */
const NOTE_MAX_CHARS = 500;

const GRID_SHAPE_MESSAGE =
  "grid 는 rrfK 숫자 목록, weights 가중치 쌍 목록, matchThreshold 숫자 목록입니다.";

// null 과 빈 문자열은 값을 안 정한 것으로 본다(운영값을 쓴다). 화면이 빈 칸을 보내지 않으므로 빈 문자열도 같이 받는다.
const blankToUndefined = (value: unknown) =>
  value === null || value === "" ? undefined : value;

/** 평가 파라미터 하나의 허용 범위. match_count 상한 20 은 두 RPC 본문의 least(match_count, 20) 과 같다. */
function paramRule(key: string, min: number, max: number, integer: boolean) {
  const error = `${key} 는 ${min}부터 ${max} 사이 ${integer ? "정수" : "숫자"}여야 합니다.`;
  const number = z.number({ error });
  return z.preprocess(
    blankToUndefined,
    (integer ? number.int({ error }) : number)
      .min(min, { error })
      .max(max, { error })
      .optional(),
  );
}

/** 덮어쓸 파라미터. 키 순서가 사유의 우선순위다. */
const evalOverrides = z.object(
  {
    matchThreshold: paramRule("matchThreshold", 0, 1, false),
    rrfK: paramRule("rrfK", 1, 200, true),
    fullTextWeight: paramRule("fullTextWeight", 0, 5, false),
    semanticWeight: paramRule("semanticWeight", 0, 5, false),
    matchCount: paramRule("matchCount", 1, 20, true),
  },
  { error: "params 는 객체여야 합니다." },
);
export type EvalOverrides = z.output<typeof evalOverrides>;

const numberList = z
  .array(z.number({ error: GRID_SHAPE_MESSAGE }), { error: GRID_SHAPE_MESSAGE })
  .nullish()
  .transform((list) => list ?? []);

const weightPair = z.object(
  {
    fullText: z.number({ error: GRID_SHAPE_MESSAGE }),
    semantic: z.number({ error: GRID_SHAPE_MESSAGE }),
  },
  { error: GRID_SHAPE_MESSAGE },
);

/**
 * rrf_k 목록 x 가중치 쌍 목록 x threshold 목록. 빈 축은 운영값 하나로 채우므로 서버가 조합을 만든다.
 * 조합 수는 빈 축을 1로 세어 상한을 보고, 조합마다 단일 실행과 같은 범위 검사를 rrf_k, 가중치 쌍, threshold 순으로 한다.
 */
const sweepGrid = z
  .object(
    {
      rrfK: numberList,
      weights: z
        .array(weightPair, { error: GRID_SHAPE_MESSAGE })
        .nullish()
        .transform((list) => list ?? []),
      matchThreshold: numberList,
    },
    { error: "grid 는 객체여야 합니다." },
  )
  .superRefine((grid, ctx) => {
    const rrfAxis = grid.rrfK.length ? grid.rrfK : [undefined];
    const weightAxis = grid.weights.length ? grid.weights : [undefined];
    const thresholdAxis = grid.matchThreshold.length
      ? grid.matchThreshold
      : [undefined];
    const total = rrfAxis.length * weightAxis.length * thresholdAxis.length;
    if (total > SWEEP_MAX_COMBOS) {
      ctx.addIssue({
        code: "custom",
        message: `조합은 ${SWEEP_MAX_COMBOS}개까지입니다. 지금 ${total}개입니다.`,
      });
      return;
    }
    for (const rrfK of rrfAxis) {
      for (const pair of weightAxis) {
        for (const matchThreshold of thresholdAxis) {
          const combo = evalOverrides.safeParse({
            rrfK,
            fullTextWeight: pair?.fullText,
            semanticWeight: pair?.semantic,
            matchThreshold,
          });
          if (combo.success) continue;
          ctx.addIssue({
            code: "custom",
            message: combo.error.issues[0]?.message ?? GRID_SHAPE_MESSAGE,
          });
          return;
        }
      }
    }
  });
export type SweepGrid = z.output<typeof sweepGrid>;

// 필드 순서가 사유의 우선순위다: 지식 유형, 메모, 그 뒤 action 별 칸.
const common = {
  knowledgeType: z.enum(KNOWLEDGE_TYPES, {
    error: "knowledgeType 이 올바르지 않습니다.",
  }),
  note: z
    .string({ error: "note 는 문자열이어야 합니다." })
    .nullish()
    .transform((note) => note?.trim().slice(0, NOTE_MAX_CHARS) || null),
};

/** POST 본문. 조합 비교는 RRF 를 바꾸는 실험이라 hybrid 로만 돈다. */
export const evalRequestBody = z.discriminatedUnion(
  "action",
  [
    z.object({
      action: z.literal("run"),
      ...common,
      mode: z
        .enum(EVAL_MODES, { error: "mode 는 vector 또는 hybrid 입니다." })
        .nullish()
        .transform((mode) => mode ?? "hybrid"),
      params: evalOverrides.nullish().transform((params) => params ?? {}),
    }),
    z.object({ action: z.literal("sweep"), ...common, grid: sweepGrid }),
  ],
  {
    error: (issue) =>
      issue.code === "invalid_union"
        ? "action 은 run 또는 sweep 입니다."
        : "요청 바디가 올바르지 않습니다.",
  },
);
export type EvalRequestBody = z.output<typeof evalRequestBody>;
