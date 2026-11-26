// STEP1 BasicInfoForm 이전 주제 여러 개 입력 검증.
//
// 개수와 길이 상한은 `api/_lib/performance/previous-topics.ts`가 단일 정본이고
// 서버(session.ts)도 같은 값을 읽는다. 이 파일은 프론트 쪽만 본다.
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import {
  getSubjectOptions,
  SUBJECT_GROUPS,
} from "@/data/performanceCurriculum";
import {
  PREVIOUS_TOPIC_MAX_COUNT,
  PREVIOUS_TOPIC_MAX_LENGTH,
} from "../../../../api/_lib/performance/previous-topics.js";
import BasicInfoForm from "./BasicInfoForm";

const FIRST_LABEL = /같은 과목에서 이전에 한 주제/;

function topicInputs() {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name^="previousTopic"]'),
  );
}

describe("BasicInfoForm 이전 주제", () => {
  test("처음에는 입력칸이 하나이고 글자 수 상한이 80이다", () => {
    render(<BasicInfoForm />);

    expect(topicInputs()).toHaveLength(1);
    expect(screen.getByLabelText(FIRST_LABEL)).toHaveAttribute(
      "maxLength",
      String(PREVIOUS_TOPIC_MAX_LENGTH),
    );
    expect(PREVIOUS_TOPIC_MAX_LENGTH).toBe(80);
  });

  test("initialValues.previousTopic의 줄마다 입력칸이 생긴다", () => {
    render(<BasicInfoForm initialValues={{ previousTopic: "a\nb" }} />);

    expect(topicInputs().map((input) => input.value)).toEqual(["a", "b"]);
    expect(screen.getByLabelText("이전에 한 주제 2")).toHaveValue("b");
  });
});
