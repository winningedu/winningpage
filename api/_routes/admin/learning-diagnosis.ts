// /api/admin/learning-diagnosis 아래 학습진단 라우트(질문, 답변, 추천 프로그램). 관리자 앱(api/_routes/admin/app.ts)이 .route("/learning-diagnosis", learningDiagnosis) 로 붙인다.
// 요청 검증은 shared/learning-diagnosis/contract.ts 를 따르고, 목록, 등록, 수정, 삭제는 api/_lib/learning-diagnosis/crud.ts 가 한다.
// 경로마다 메서드 뒤에 .all(path, methodNotAllowed(...)) 를 단다. 검증 순서는 경로 id, 본문이다(defineHandler 의 query, body 순서).
// 권한: 메뉴 learningDiagnosis(GET view, 쓰기 edit). 서비스 롤은 RLS 를 건너뛰므로 옛 RLS(관리자 ALL)가 허용한 동작만 연다.

import {
  idParams,
  type OptionList,
  type OptionRow,
  optionCreateBody,
  optionPatchBody,
  type ProgramList,
  type ProgramRow,
  programBody,
  type QuestionList,
  type QuestionRow,
  questionBody,
} from "../../../shared/learning-diagnosis/contract.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import {
  deleteRow,
  insertRow,
  listRows,
  updateRow,
  withOptionText,
} from "../../_lib/learning-diagnosis/crud.js";

const UNHANDLED = "학습진단 데이터를 처리하지 못했어요.";
const PERMISSION = { key: "learningDiagnosis" } as const;

const questionsGuard = admin({
  permission: PERMISSION,
  unhandledMessage: UNHANDLED,
  logLabel: "[admin/learning-diagnosis/questions]",
});
const questionByIdGuard = admin({
  permission: PERMISSION,
  unhandledMessage: UNHANDLED,
  logLabel: "[admin/learning-diagnosis/questions/id]",
});
const optionsGuard = admin({
  permission: PERMISSION,
  unhandledMessage: UNHANDLED,
  logLabel: "[admin/learning-diagnosis/options]",
});
const optionByIdGuard = admin({
  permission: PERMISSION,
  unhandledMessage: UNHANDLED,
  logLabel: "[admin/learning-diagnosis/options/id]",
});
const programsGuard = admin({
  permission: PERMISSION,
  unhandledMessage: UNHANDLED,
  logLabel: "[admin/learning-diagnosis/programs]",
});
const programByIdGuard = admin({
  permission: PERMISSION,
  unhandledMessage: UNHANDLED,
  logLabel: "[admin/learning-diagnosis/programs/id]",
});

export const learningDiagnosis = adminFactory
  .createApp()
  // GET /questions: 질문 목록 { items }. POST /questions: 질문 등록(201).
  .get("/questions", questionsGuard, async (c) => {
    const items = await listRows(
      c.var.supabaseAdmin,
      "learning_diagnosis_questions",
    );
    return c.json({ items } satisfies QuestionList);
  })
  .post(
    "/questions",
    questionsGuard,
    validate("json", questionBody),
    async (c) => {
      const row = await insertRow(
        c.var.supabaseAdmin,
        "learning_diagnosis_questions",
        "질문",
        c.req.valid("json"),
      );
      return c.json(row satisfies QuestionRow, 201);
    },
  )
  .all("/questions", methodNotAllowed("GET", "POST"))
  // PATCH /questions/:id: 질문 수정. DELETE: 질문 삭제(답변은 FK cascade 로 함께 지워진다). 닿은 행이 없으면 404.
  .patch(
    "/questions/:id",
    questionByIdGuard,
    validate("param", idParams),
    validate("json", questionBody),
    async (c) => {
      const row = await updateRow(
        c.var.supabaseAdmin,
        "learning_diagnosis_questions",
        "질문",
        c.req.valid("param").id,
        c.req.valid("json"),
      );
      return c.json(row satisfies QuestionRow);
    },
  )
  .delete(
    "/questions/:id",
    questionByIdGuard,
    validate("param", idParams),
    async (c) => {
      await deleteRow(
        c.var.supabaseAdmin,
        "learning_diagnosis_questions",
        "질문",
        c.req.valid("param").id,
      );
      return c.body(null, 204);
    },
  )
  .all("/questions/:id", methodNotAllowed("DELETE", "PATCH"))
  // GET /options: 답변 목록 { items }. POST /options: 답변 등록(201), 없는 질문은 404.
  .get("/options", optionsGuard, async (c) => {
    const items = await listRows(
      c.var.supabaseAdmin,
      "learning_diagnosis_options",
    );
    return c.json({ items } satisfies OptionList);
  })
  .post(
    "/options",
    optionsGuard,
    validate("json", optionCreateBody),
    async (c) => {
      const row = await insertRow(
        c.var.supabaseAdmin,
        "learning_diagnosis_options",
        "답변",
        withOptionText(c.req.valid("json")),
      );
      return c.json(row satisfies OptionRow, 201);
    },
  )
  .all("/options", methodNotAllowed("GET", "POST"))
  // PATCH /options/:id: 답변 수정(question_id 는 쓰지 않는다). DELETE: 답변 삭제. 닿은 행이 없으면 404.
  .patch(
    "/options/:id",
    optionByIdGuard,
    validate("param", idParams),
    validate("json", optionPatchBody),
    async (c) => {
      const row = await updateRow(
        c.var.supabaseAdmin,
        "learning_diagnosis_options",
        "답변",
        c.req.valid("param").id,
        withOptionText(c.req.valid("json")),
      );
      return c.json(row satisfies OptionRow);
    },
  )
  .delete(
    "/options/:id",
    optionByIdGuard,
    validate("param", idParams),
    async (c) => {
      await deleteRow(
        c.var.supabaseAdmin,
        "learning_diagnosis_options",
        "답변",
        c.req.valid("param").id,
      );
      return c.body(null, 204);
    },
  )
  .all("/options/:id", methodNotAllowed("DELETE", "PATCH"))
  // GET /programs: 추천 프로그램 목록 { items }. POST /programs: 등록(201).
  .get("/programs", programsGuard, async (c) => {
    const items = await listRows(
      c.var.supabaseAdmin,
      "learning_diagnosis_programs",
    );
    return c.json({ items } satisfies ProgramList);
  })
  .post(
    "/programs",
    programsGuard,
    validate("json", programBody),
    async (c) => {
      const row = await insertRow(
        c.var.supabaseAdmin,
        "learning_diagnosis_programs",
        "추천 프로그램",
        c.req.valid("json"),
      );
      return c.json(row satisfies ProgramRow, 201);
    },
  )
  .all("/programs", methodNotAllowed("GET", "POST"))
  // PATCH /programs/:id: 추천 프로그램 수정. DELETE: 삭제. 닿은 행이 없으면 404.
  .patch(
    "/programs/:id",
    programByIdGuard,
    validate("param", idParams),
    validate("json", programBody),
    async (c) => {
      const row = await updateRow(
        c.var.supabaseAdmin,
        "learning_diagnosis_programs",
        "추천 프로그램",
        c.req.valid("param").id,
        c.req.valid("json"),
      );
      return c.json(row satisfies ProgramRow);
    },
  )
  .delete(
    "/programs/:id",
    programByIdGuard,
    validate("param", idParams),
    async (c) => {
      await deleteRow(
        c.var.supabaseAdmin,
        "learning_diagnosis_programs",
        "추천 프로그램",
        c.req.valid("param").id,
      );
      return c.body(null, 204);
    },
  )
  .all("/programs/:id", methodNotAllowed("DELETE", "PATCH"));
