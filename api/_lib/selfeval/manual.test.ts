import { describe, expect, it } from "vitest";
import {
  type ManualInput,
  manualToAnalysis,
  manualToRecordInsert,
  validateManualInput,
} from "./manual.js";

const input = (o: Partial<ManualInput> = {}): ManualInput => ({
  activityName: "교내 통계 프로젝트",
  subjectOrArea: "수학",
  gradeLabel: "고2",
  semester: 1,
  motive: "뉴스를 보고 궁금했다",
  concept: "표본 추출",
  action: "설문을 돌렸다",
  method: "설문 직접 제작",
  result: "응답 30명 중 18명이 찬성",
  role: "",
  limitation: "표본이 적다",
  next: "",
  ...o,
});

describe("validateManualInput", () => {
  it("활동명과 과목이 있으면 통과", () => {
    expect(validateManualInput(input())).toEqual({ ok: true });
  });
  it("활동명이 비면 ACTIVITY_NAME_REQUIRED", () => {
    const r = validateManualInput(input({ activityName: "  " }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ACTIVITY_NAME_REQUIRED");
  });
  it("과목이 비면 SUBJECT_REQUIRED", () => {
    const r = validateManualInput(input({ subjectOrArea: "" }));
    if (r.ok) throw new Error("실패해야 한다");
    expect(r.code).toBe("SUBJECT_REQUIRED");
    expect(r.message).not.toBe("");
  });
});

describe("manualToRecordInsert", () => {
  it("직접 입력 행으로 변환한다", () => {
    const row = manualToRecordInsert(input(), "p1");
    expect(row).toMatchObject({
      profile_id: "p1",
      source_program: "manual",
      status: "draft",
      grade_label: "고2",
      semester: 1,
      subject_group: "수학",
      subject: "수학",
      topic: "교내 통계 프로젝트",
      concept: "표본 추출",
      method: "설문 직접 제작",
      result: "응답 30명 중 18명이 찬성",
      limitation: "표본이 적다",
      sources: [],
    });
    expect(row.numbers).toEqual(["30명", "18명"]);
  });
  it("빈 문자열은 null 로 바꾼다", () => {
    const row = manualToRecordInsert(
      input({
        concept: "",
        method: " ",
        result: "",
        limitation: "",
        gradeLabel: null,
        semester: null,
      }),
      "p1",
    );
    expect(row.concept).toBeNull();
    expect(row.method).toBeNull();
    expect(row.result).toBeNull();
    expect(row.limitation).toBeNull();
    expect(row.grade_label).toBeNull();
    expect(row.numbers).toEqual([]);
  });
});

describe("manualToAnalysis", () => {
  it("11항목을 채우고 값이 있으면 student, 없으면 empty", () => {
    const a = manualToAnalysis(input());
    expect(a.values.motive).toBe("뉴스를 보고 궁금했다");
    expect(a.values.collaboration).toBe("");
    expect(a.values.learning).toBe("");
    expect(a.values.career).toBe("");
    expect(a.sources.motive).toBe("student");
    expect(a.sources.role).toBe("empty");
    expect(a.sources.career).toBe("empty");
    expect(a.conflicts).toEqual([]);
    expect(Object.keys(a.values)).toHaveLength(11);
  });
});
