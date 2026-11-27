// 수행평가 제출물 계약. GET, PUT /api/performance/submission 의 요청과 응답 스키마.
// 형식 검사(uuid, fields 가 문자열 맵, mode)는 여기서 하고, 제출폼에 없는 항목과 글자 수 상한은 서버가 가진 스키마로 판정하는
// 도메인 규칙이라 라우트가 판정한다.

import { z } from "zod";

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/** GET: 제출폼 렌더 재료. 값은 DB uuid 컬럼에 가므로 형식만 본다(버전 숫자는 보지 않는다). */
export const submissionQuery = z.object({ sessionId: z.guid() });

/** PUT: 중간 저장(draft) 또는 제출(submit). fields 는 항목 키마다 문자열 하나다. */
export const submissionBody = z.object({
  sessionId: z.guid(),
  fields: z.record(z.string(), z.string()),
  mode: z.enum(["draft", "submit"]),
});

/** 브라우저가 보내는 모양. */
export type SubmissionBodyInput = z.input<typeof submissionBody>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

const nullableText = z.string().nullable();

/** 서버가 판정한 제출 스키마. 항목 목록의 키와 이름만 고정하고 안내문, 예시 등은 화면이 읽는다. */
export const submissionSchemaSchema = z.looseObject({
  type: z.string(),
  label: z.string(),
  notice: z.string(),
  fields: z.array(
    z.looseObject({
      key: z.string(),
      label: z.string(),
      required: z.boolean(),
    }),
  ),
});

/** 제출본 한 건. 저장 실패(제출 게이트)의 확장 멤버에도 같은 키가 실린다. */
export const clientSubmissionSchema = z.looseObject({
  submissionId: z.string(),
  revision: z.number(),
  fields: z.record(z.string(), z.string()),
  charCounts: z.record(z.string(), z.unknown()),
  isDraft: z.boolean(),
  isFinal: z.boolean(),
  finalizedAt: nullableText,
  finalizeReason: nullableText,
  submittedAt: nullableText,
  savedAt: nullableText,
});

export const submissionFormResponse = z.looseObject({
  schema: submissionSchemaSchema,
  submission: clientSubmissionSchema.nullable(),
  minChars: z.number(),
  maxRevisions: z.number(),
});

export const submissionSaveResponse = clientSubmissionSchema.extend({
  mode: z.enum(["draft", "submit"]),
  schema: submissionSchemaSchema,
  charTotal: z.number(),
  minChars: z.number(),
  maxRevisions: z.number(),
});
