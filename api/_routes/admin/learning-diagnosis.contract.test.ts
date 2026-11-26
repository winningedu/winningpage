// 학습진단 라우트 응답이 브라우저가 검증하는 계약 스키마(shared/learning-diagnosis/contract.ts)를 통과하는지와 405 Allow 를 본다.
// 다른 학습진단 테스트는 필요한 컬럼만 둔 행을 쓰므로, 여기서는 실제 컬럼을 다 채운 행으로 부른다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  optionListSchema,
  programListSchema,
  questionListSchema,
} from "../../../shared/learning-diagnosis/contract.js";
import {
  callRoute,
  createAdminFake,
  type Respond,
} from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import { app } from "../app.js";

const ID = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";

const QUESTION = {
  id: ID,
  question_key: null,
  title: "질문",
  description: null,
  input_type: "single",
  is_required: true,
  is_active: true,
  sort_order: 1,
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: null,
};

const OPTION = {
  id: ID,
  question_id: ID,
  question_key: null,
  label: "답변",
  option_text: "답변",
  program_ids: ["p1"],
  program_keys: null,
  is_active: true,
  sort_order: 1,
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: null,
};

const PROGRAM = {
  id: ID,
  program_key: null,
  title: "프로그램",
  badge: null,
  description: null,
  primary_button_text: null,
  primary_button_link: null,
  secondary_button_text: null,
  secondary_button_link: null,
  payment_button_text: null,
  payment_link: null,
  service_button_text: null,
  service_link: null,
  icon: null,
  is_active: true,
  sort_order: 1,
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: null,
};

const rows =
  (data: unknown): Respond =>
  () => ({ data: [data], error: null });

beforeEach(() => {
  kit.admin = createAdminFake({
    permissions: [{ resource_key: "learningDiagnosis", level: "edit" }],
    tables: {
      learning_diagnosis_questions: rows(QUESTION),
      learning_diagnosis_options: rows(OPTION),
      learning_diagnosis_programs: rows(PROGRAM),
    },
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("학습진단 응답과 계약 스키마", () => {
  test.each([
    ["questions", questionListSchema],
    ["options", optionListSchema],
    ["programs", programListSchema],
  ])("%s 목록", async (name, schema) => {
    const r = await callRoute({
      app,
      path: `/api/admin/learning-diagnosis/${name}`,
    });
    expect(r.status).toBe(200);
    expect(schema.safeParse(r.body).success).toBe(true);
  });
});

describe("405 Allow", () => {
  test.each([
    ["questions", "GET, HEAD, POST"],
    ["options", "GET, HEAD, POST"],
    ["programs", "GET, HEAD, POST"],
    [`questions/${ID}`, "DELETE, PATCH"],
    [`options/${ID}`, "DELETE, PATCH"],
    [`programs/${ID}`, "DELETE, PATCH"],
  ])("%s 는 허용하지 않는 메서드에 Allow 를 단다", async (name, allow) => {
    const r = await app.request(`/api/admin/learning-diagnosis/${name}`, {
      method: "PUT",
      headers: { authorization: "Bearer admin-token" },
    });
    expect(r.status).toBe(405);
    expect(r.headers.get("allow")).toBe(allow);
  });
});
