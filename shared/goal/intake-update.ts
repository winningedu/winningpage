// 내 정보 수정 계약. POST /api/goal/intake-update 의 요청과 응답 스키마.
// 목표 대학, 내신, 모의고사 중 한 구간만 고친다. 구간 안의 값 규칙은 온보딩과 같아서 서버가 intake.ts 의 검증을 그대로 쓴다.

import { z } from "zod";
import {
  intakeStudent,
  mockExamInput,
  naesinInput,
  targetUniversity,
} from "./intake.js";

/**
 * 다른 학생의 id 를 실어 보내는 변조를 서버가 403 으로 막는다. 정상 호출은 싣지 않는다.
 */
const profileId = z.union([z.string(), z.number()]).nullish();

export const intakeUpdateBody = z.discriminatedUnion("section", [
  z.object({
    section: z.literal("target"),
    profileId,
    upperUniversity: targetUniversity,
    lowerUniversity: targetUniversity,
  }),
  z.object({ section: z.literal("naesin"), profileId, naesin: naesinInput }),
  z.object({ section: z.literal("mock"), profileId, mockExam: mockExamInput }),
]);

/** 브라우저가 보내는 모양. */
export type IntakeUpdateInput = z.input<typeof intakeUpdateBody>;

export const intakeUpdateResponse = z.object({ student: intakeStudent });
