import { describe, expect, test } from "vitest";
import {
  buildManualInput,
  initialManualForm,
  validateManualForm,
} from "./manualForm";

const session = {
  area: "subject" as const,
  subject: "수학",
  gradeLabel: "고2" as const,
  semester: 1 as const,
};

describe("initialManualForm", () => {
  test("교과 세션이면 과목을 기본값으로, 학년과 학기도 세션에서 가져온다", () => {
    const f = initialManualForm(session);
    expect(f.subjectOrArea).toBe("수학");
    expect(f.gradeLabel).toBe("고2");
    expect(f.semester).toBe("1");
    expect(f.activityName).toBe("");
  });

  test("창체 세션이면 영역 이름을 기본값으로 쓴다", () => {
    const f = initialManualForm({
      ...session,
      area: "club",
      subject: null,
    });
    expect(f.subjectOrArea).toBe("동아리");
  });
});

describe("validateManualForm", () => {
  test("활동명과 과목 또는 영역은 필수다", () => {
    const f = { ...initialManualForm(session), subjectOrArea: "" };
    expect(validateManualForm(f)).toEqual({
      activityName: expect.any(String),
      subjectOrArea: expect.any(String),
    });
    expect(
      validateManualForm({ ...f, activityName: "탐구", subjectOrArea: "수학" }),
    ).toEqual({});
  });
});

describe("buildManualInput", () => {
  test("서버 바디로 옮기며 학년과 학기 빈 값은 null 이다", () => {
    const f = {
      ...initialManualForm(session),
      activityName: " 탐구 ",
      gradeLabel: "" as const,
      semester: "" as const,
    };
    expect(buildManualInput(f)).toMatchObject({
      activityName: "탐구",
      subjectOrArea: "수학",
      gradeLabel: null,
      semester: null,
      motive: "",
    });
  });
});
