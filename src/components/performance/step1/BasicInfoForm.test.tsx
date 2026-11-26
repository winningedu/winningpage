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

  test("이전 주제 추가 버튼을 누르면 입력칸이 하나 늘고 5개가 되면 버튼이 사라진다", () => {
    render(<BasicInfoForm />);

    for (let count = 1; count < PREVIOUS_TOPIC_MAX_COUNT; count++) {
      fireEvent.click(screen.getByRole("button", { name: "+ 이전 주제 추가" }));
      expect(topicInputs()).toHaveLength(count + 1);
    }

    expect(topicInputs()).toHaveLength(PREVIOUS_TOPIC_MAX_COUNT);
    expect(
      screen.queryByRole("button", { name: "+ 이전 주제 추가" }),
    ).not.toBeInTheDocument();
  });

  test("첫 칸에는 삭제 버튼이 없고, 추가한 칸의 삭제 버튼은 그 칸만 지운다", () => {
    render(<BasicInfoForm initialValues={{ previousTopic: "a\nb\nc" }} />);

    expect(
      screen.queryByRole("button", { name: "이전 주제 1 삭제" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "이전 주제 2 삭제" }));

    expect(topicInputs().map((input) => input.value)).toEqual(["a", "c"]);
  });

  test("제출하면 비지 않은 칸을 다듬어 줄바꿈으로 이어 previousTopic 하나로 보낸다", () => {
    const onSubmit = vi.fn();
    const { container } = render(<BasicInfoForm onSubmit={onSubmit} />);
    const group = SUBJECT_GROUPS[0] as string;
    const subject = getSubjectOptions(group)[0] as string;
    const select = (name: string, value: string) =>
      fireEvent.change(
        container.querySelector(`select[name="${name}"]`) as HTMLSelectElement,
        { target: { value } },
      );

    select("gradeLabel", "고1");
    select("semester", "1학기");
    select("subjectGroup", group);
    select("subject", subject);
    fireEvent.change(screen.getByLabelText(/희망 진로/), {
      target: { value: "의학" },
    });

    fireEvent.click(screen.getByRole("button", { name: "+ 이전 주제 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "+ 이전 주제 추가" }));
    fireEvent.change(screen.getByLabelText(FIRST_LABEL), {
      target: { value: " a " },
    });
    fireEvent.change(screen.getByLabelText("이전에 한 주제 3"), {
      target: { value: "c" },
    });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      subject,
      previousTopic: "a\nc",
    });
  });
});
