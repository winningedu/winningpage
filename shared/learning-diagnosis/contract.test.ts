// 학습진단 계약: 서버가 검증하는 요청 스키마와 브라우저가 검증하는 응답 스키마.

import { describe, expect, test } from "vitest";
import {
  idParams,
  optionCreateBody,
  optionListSchema,
  optionPatchBody,
  programBody,
  programListSchema,
  questionBody,
  questionListSchema,
} from "./contract.js";

const ID = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";

const QUESTION = {
  title: "질문",
  description: "",
  input_type: "single",
  is_required: true,
  is_active: true,
  sort_order: 3,
};

const OPTION = {
  label: "답변",
  program_ids: ["p1"],
  is_active: true,
  sort_order: 2,
};

const PROGRAM = {
  title: "프로그램",
  badge: "",
  description: "",
  primary_button_text: "",
  primary_button_link: "",
  secondary_button_text: "",
  secondary_button_link: "",
  icon: "",
  is_active: true,
  sort_order: 1,
};

describe("요청 스키마", () => {
  test("질문 제목은 앞뒤 공백을 걷고 비면 거부한다", () => {
    expect(questionBody.parse({ ...QUESTION, title: " 질문 " }).title).toBe(
      "질문",
    );
    expect(questionBody.safeParse({ ...QUESTION, title: "  " }).success).toBe(
      false,
    );
  });

  test("질문 input_type 은 single, multiple 만 받는다", () => {
    expect(
      questionBody.safeParse({ ...QUESTION, input_type: "x" }).success,
    ).toBe(false);
  });

  test("정의되지 않은 키와 정수가 아닌 sort_order 는 거부한다", () => {
    expect(
      questionBody.safeParse({ ...QUESTION, question_key: "k" }).success,
    ).toBe(false);
    expect(
      questionBody.safeParse({ ...QUESTION, sort_order: 1.5 }).success,
    ).toBe(false);
  });

  test("답변 등록은 빈 label 을 받고 question_id 는 uuid 여야 한다", () => {
    expect(
      optionCreateBody.safeParse({ ...OPTION, label: "", question_id: ID })
        .success,
    ).toBe(true);
    expect(
      optionCreateBody.safeParse({ ...OPTION, question_id: "x" }).success,
    ).toBe(false);
  });

  test("답변 수정은 빈 label 과 question_id 를 거부한다", () => {
    expect(optionPatchBody.safeParse({ ...OPTION, label: " " }).success).toBe(
      false,
    );
    expect(
      optionPatchBody.safeParse({ ...OPTION, question_id: ID }).success,
    ).toBe(false);
  });

  test("추천 프로그램 제목은 비면 거부한다", () => {
    expect(programBody.safeParse(PROGRAM).success).toBe(true);
    expect(programBody.safeParse({ ...PROGRAM, title: "" }).success).toBe(
      false,
    );
  });

  test("경로 id 는 uuid 다", () => {
    expect(idParams.safeParse({ id: ID }).success).toBe(true);
    expect(idParams.safeParse({ id: "abc" }).success).toBe(false);
  });
});

describe("응답 스키마", () => {
  test("DB 가 비워 둘 수 있는 컬럼과 program_ids 배열을 받는다", () => {
    expect(
      questionListSchema.safeParse({
        items: [
          {
            id: "q1",
            title: "질문",
            description: null,
            input_type: "single",
            is_required: null,
            is_active: null,
            sort_order: null,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      optionListSchema.safeParse({
        items: [
          {
            id: "o1",
            question_id: null,
            label: null,
            option_text: "",
            program_ids: null,
            is_active: null,
            sort_order: null,
          },
          {
            id: "o2",
            question_id: ID,
            label: "답변",
            option_text: "답변",
            program_ids: ["p1"],
            is_active: true,
            sort_order: 1,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      programListSchema.safeParse({
        items: [
          {
            id: "p1",
            title: "프로그램",
            badge: null,
            description: null,
            primary_button_text: null,
            primary_button_link: null,
            secondary_button_text: null,
            secondary_button_link: null,
            icon: null,
            is_active: null,
            sort_order: null,
          },
        ],
      }).success,
    ).toBe(true);
  });

  test("program_ids 가 문자열 배열이 아니면 거부한다", () => {
    expect(
      optionListSchema.safeParse({
        items: [
          {
            id: "o1",
            question_id: null,
            label: null,
            option_text: "",
            program_ids: "p1",
            is_active: null,
            sort_order: null,
          },
        ],
      }).success,
    ).toBe(false);
  });
});
