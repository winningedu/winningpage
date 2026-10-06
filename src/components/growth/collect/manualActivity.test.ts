import { beforeEach, describe, expect, test, vi } from "vitest";

const { insertMock, deleteChain, fromMock } = vi.hoisted(() => {
  const insertMock = vi.fn();
  const deleteChain = { eq: vi.fn() };
  const fromMock = vi.fn();
  return { insertMock, deleteChain, fromMock };
});

vi.mock("@/lib/supabase", () => ({ supabase: { from: fromMock } }));

import {
  deleteManualActivity,
  EMPTY_MANUAL_FORM,
  insertManualActivity,
  type ManualForm,
  validateManualForm,
} from "./manualActivity";

const filled: ManualForm = {
  gradeLabel: "고1",
  semester: "2",
  subjectGroup: "통합사회",
  topic: "도시 열섬 현상",
  concept: "",
  method: "",
  result: "",
  limitation: "",
};

describe("직접 입력 폼 검증", () => {
  test("학년, 학기, 과목 또는 영역, 주제가 있으면 통과하고 빈 서술 칸은 null 로 둔다", () => {
    expect(validateManualForm(filled)).toEqual({
      ok: true,
      value: {
        gradeLabel: "고1",
        semester: 2,
        subjectGroup: "통합사회",
        topic: "도시 열섬 현상",
        concept: null,
        method: null,
        result: null,
        limitation: null,
      },
    });
  });

  test("비어 있는 필수 칸마다 오류를 모은다", () => {
    const result = validateManualForm(EMPTY_MANUAL_FORM);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        "gradeLabel",
        "semester",
        "subjectGroup",
        "topic",
      ]);
    }
  });

  test("공백만 있는 칸은 비어 있는 것으로 본다", () => {
    const result = validateManualForm({ ...filled, topic: "   " });
    expect(result.ok).toBe(false);
  });

  test("값 앞뒤 공백은 잘라 낸다", () => {
    const result = validateManualForm({ ...filled, concept: "  열섬  " });
    expect(result.ok && result.value.concept).toBe("열섬");
  });

  test("너무 긴 글은 거절한다", () => {
    const result = validateManualForm({ ...filled, result: "가".repeat(1001) });
    expect(result.ok).toBe(false);
  });
});

describe("저장과 삭제", () => {
  beforeEach(() => {
    insertMock.mockReset();
    deleteChain.eq.mockReset();
    fromMock.mockReset();
    fromMock.mockReturnValue({
      insert: insertMock,
      delete: () => ({ eq: deleteChain.eq }),
    });
  });

  test("manual draft 행으로 본인 profile_id 와 함께 넣는다", async () => {
    insertMock.mockResolvedValue({ error: null });
    const v = validateManualForm(filled);
    if (!v.ok) throw new Error("검증 실패");
    const result = await insertManualActivity("u1", v.value);
    expect(fromMock).toHaveBeenCalledWith("activity_records");
    expect(insertMock).toHaveBeenCalledWith({
      profile_id: "u1",
      source_program: "manual",
      status: "draft",
      grade_label: "고1",
      semester: 2,
      subject_group: "통합사회",
      topic: "도시 열섬 현상",
      concept: null,
      method: null,
      result: null,
      limitation: null,
    });
    expect(result).toEqual({ ok: true });
  });

  test("저장 실패는 화면용 문구로 돌려준다", async () => {
    insertMock.mockResolvedValue({ error: { message: "rls" } });
    const v = validateManualForm(filled);
    if (!v.ok) throw new Error("검증 실패");
    expect(await insertManualActivity("u1", v.value)).toEqual({
      ok: false,
      message: "활동을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    });
  });

  test("삭제는 manual 행 id 로만 지운다", async () => {
    const second = vi.fn().mockResolvedValue({ error: null });
    deleteChain.eq.mockReturnValue({ eq: second });
    expect(await deleteManualActivity("a1")).toEqual({ ok: true });
    expect(deleteChain.eq).toHaveBeenCalledWith("id", "a1");
    expect(second).toHaveBeenCalledWith("source_program", "manual");
  });
});
