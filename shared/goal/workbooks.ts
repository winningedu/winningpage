// 문제집 계약. GET/POST/PUT/DELETE /api/goal/workbooks 의 요청과 응답 스키마.
// 현재 페이지가 전체 페이지를 넘는지, 전체 페이지를 고치려는지는 서버가 도메인 규칙으로 막는다(문구를 지킨다).

import { z } from "zod";
import { emptyResponse, withNotAllowed } from "./gate.js";

/** sql/76_goal_workbooks.sql goal_workbooks_subject_check 와 같은 5종. */
export const WORKBOOK_SUBJECTS = [
  "korean",
  "math",
  "english",
  "science",
  "etc",
] as const;

export const WORKBOOK_TITLE_MAX_LENGTH = 100;
/** 오입력(자릿수 실수)이 그대로 저장되는 것만 막는 넉넉한 상한. */
export const WORKBOOK_MAX_PAGES = 100000;

const id = z.number().int().positive();
const title = z.string().trim().min(1).max(WORKBOOK_TITLE_MAX_LENGTH);
const currentPage = z.number().int().min(0).max(WORKBOOK_MAX_PAGES);

export const workbookCreateBody = z.object({
  subject: z.enum(WORKBOOK_SUBJECTS),
  title,
  totalPages: z.number().int().min(1).max(WORKBOOK_MAX_PAGES),
  currentPage: currentPage.nullish(),
});

/** 수정 대상은 제목과 현재 페이지다. totalPages 는 보내면 서버가 거부한다. */
export const workbookUpdateBody = z.object({
  id,
  title: title.optional(),
  totalPages: z.number().optional(),
  currentPage: currentPage.optional(),
});

/** "완독! 책장에 꽂기". */
export const workbookShelveBody = z.object({ id, shelve: z.literal(true) });

/** PUT 본문: 책장에 꽂기를 먼저 보고, 아니면 수정이다. */
export const workbookPutBody = z.union([
  workbookShelveBody,
  workbookUpdateBody,
]);
export const workbookDeleteBody = z.object({ id });

/** 브라우저가 보내는 모양. */
export type WorkbookCreateInput = z.input<typeof workbookCreateBody>;
export type WorkbookUpdateInput = z.input<typeof workbookUpdateBody>;
export type WorkbookPutInput = z.input<typeof workbookPutBody>;
export type WorkbookDeleteInput = z.input<typeof workbookDeleteBody>;

export const workbookSchema = z.object({
  id: z.number(),
  subject: z.string(),
  title: z.string(),
  totalPages: z.number().nullable(),
  currentPage: z.number().nullable(),
  status: z.string(),
  /** null 이면 완독해도 아직 책장에 꽂지 않았다. */
  shelvedAt: z.string().nullable(),
});

export const workbooksListResponse = withNotAllowed(
  z.object({ workbooks: z.array(workbookSchema) }),
);
export const workbookResponse = z.object({ workbook: workbookSchema });
export const workbookDeleteResponse = emptyResponse;

export type GoalWorkbook = z.output<typeof workbookSchema>;
