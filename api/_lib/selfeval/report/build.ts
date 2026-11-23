// 리포트 조립(명세 No.133, 137). 순수 함수다. 코드가 정하는 값은 모두 여기서 확정하고,
// compose 는 모델이 쓴 문장(id 에서 문장)이며 없으면 설명 칸이 null 인 채로 그린다.

import type {
  ReportPayload,
  ReportTagMap,
} from "../../../../src/lib/selfeval/reportTypes.js";
import { readBody } from "./body.js";
import { buildCh01, buildCover } from "./ch01.js";
import { buildCh02 } from "./ch02.js";
import { buildCh03 } from "./ch03.js";
import { buildCh04 } from "./ch04.js";
import { buildCh05, findNextStepCandidates } from "./ch05.js";
import type { BuildInput } from "./inputs.js";
import { buildNeeds, type ComposeNeed } from "./needs.js";

export type BuildResult = {
  payload: ReportPayload;
  tagMap: ReportTagMap;
  /** 모델이 써야 하는 문장 목록. compose 로 채우면 composeMissing 이 false 가 된다. */
  needs: ComposeNeed[];
};

export function buildReport(
  input: BuildInput,
  compose: Record<string, string> | null,
): BuildResult {
  const text = (id: string): string | null => compose?.[id] ?? null;
  const body = readBody(input.bodySections, input);
  const ch02 = buildCh02(input, body, text);
  const ch03 = buildCh03(ch02, text, input.timeZone);
  const ch04 = buildCh04(input, body, ch02, text);
  const candidates = findNextStepCandidates(input, body, ch02);
  const needs = buildNeeds(input, body, ch02, ch03, ch04, candidates);
  return {
    payload: {
      version: 1,
      cover: buildCover(input),
      ch01: buildCh01(input, body, ch02),
      ch02: ch02.ch02,
      ch03,
      ch04,
      ch05: buildCh05(input, body, ch02, ch04, text),
      composeMissing: needs.length > 0 && compose === null,
      composePartial:
        compose !== null && needs.some((n) => compose[n.id] === undefined),
    },
    tagMap: ch02.tagMap,
    needs,
  };
}
