// 자기평가서 본문(생성, 편집, 최종)과 검증의 sections 계약. 서버가 jsonb 로 저장하고 응답으로 내보내며 브라우저가 같은 스키마로 읽는다.
// 모양의 서버 정본은 api/_lib/selfeval/types.ts 다. 객체 스키마는 아는 칸만 두고, 서버가 더한 모르는 칸은 읽을 때 버린다.

import { z } from "zod";
import { ANALYSIS_FIELDS } from "./contract.js";

/** 근거 출처 유형(명세 No.145): P 수행평가, D 심화탐구, A 창체 활동, H 수기 메모, S 학생 입력. */
export const EVIDENCE_SOURCE_TYPES = ["P", "D", "A", "H", "S"] as const;
export const EVIDENCE_WEIGHTS = ["main", "sub"] as const;

/** 문장 하나가 기댄 근거 하나. 한 문장에 여러 개를 붙일 수 있다(명세 No.145, No.85). */
export const evidenceSchema = z.object({
  sourceType: z.enum(EVIDENCE_SOURCE_TYPES),
  /** P, D, A 는 활동 기록 id, H 는 수기 메모 id, S 는 null. */
  refId: z.string().nullable(),
  item: z.enum([...ANALYSIS_FIELDS, "student_input"]),
  weight: z.enum(EVIDENCE_WEIGHTS),
});

export const sentenceSchema = z.object({
  id: z.string(),
  text: z.string(),
  evidence: z.array(evidenceSchema),
  /** 확인이 필요한 문장(노란 표시). 근거가 없거나 근거로 설명되지 않는 수치가 있으면 서버가 올린다. */
  feeling: z.boolean(),
  /** 학생이 느낌 문장을 확인했는지(명세 No.49, No.57). */
  confirmed: z.boolean(),
});
