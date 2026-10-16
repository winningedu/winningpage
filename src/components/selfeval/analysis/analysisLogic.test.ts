import { describe, expect, test } from "vitest";
import type { Analysis, SessionActivityView } from "@/lib/selfeval/types";
import {
  changedEdits,
  coreActivity,
  fieldNote,
  hasUnresolvedConflict,
  needsAnalysisRun,
} from "./analysisLogic";

const values = (over: Partial<Analysis["values"]> = {}) =>
  ({ motive: "계기", concept: "개념", ...over }) as Analysis["values"];

const act = (
  role: "core" | "support",
  analysis: Analysis | null,
  id = role,
): SessionActivityView =>
  ({ activityRecordId: id, role, analysis }) as SessionActivityView;

describe("coreActivity, needsAnalysisRun", () => {
  test("핵심 활동은 role 이 core 인 것이다", () => {
    const list = [act("support", null), act("core", null)];
    expect(coreActivity(list)?.role).toBe("core");
    expect(coreActivity([act("support", null)])).toBeNull();
  });

  test("핵심 활동의 분석이 비어 있을 때만 진입 즉시 분석한다", () => {
    expect(needsAnalysisRun(act("core", null))).toBe(true);
    const done = act("core", {
      values: values(),
      sources: {} as never,
      conflicts: [],
    });
    expect(needsAnalysisRun(done)).toBe(false);
    expect(needsAnalysisRun(null)).toBe(false);
  });
});

describe("changedEdits", () => {
  test("바뀐 항목만 돌려주고 같으면 빈 객체다", () => {
    expect(
      changedEdits(values(), { motive: "계기", concept: "새 개념" }),
    ).toEqual({ concept: "새 개념" });
    expect(changedEdits(values(), {})).toEqual({});
  });
});

describe("hasUnresolvedConflict", () => {
  test("resolved 가 null 인 충돌이 하나라도 있으면 true", () => {
    const row = (resolved: string | null) =>
      ({
        kind: "numbers",
        a: { activityId: "1", text: "a" },
        b: { activityId: "2", text: "b" },
        resolved,
      }) as const;
    expect(hasUnresolvedConflict([row("a"), row(null)])).toBe(true);
    expect(hasUnresolvedConflict([row("a")])).toBe(false);
    expect(hasUnresolvedConflict([])).toBe(false);
  });
});

describe("fieldNote", () => {
  test("학생 입력은 배지, 비움은 안내 문구, 협업은 채점 제외 캡션을 단다", () => {
    expect(fieldNote("motive", "student")).toEqual({
      badge: "학생 입력",
      caption: null,
    });
    expect(fieldNote("limitation", "empty")).toEqual({
      badge: null,
      caption: "비움. 생성에서 쓰지 않아요",
    });
    expect(fieldNote("collaboration", "record")).toEqual({
      badge: null,
      caption: "채점에 반영하지 않아요",
    });
    expect(fieldNote("motive", "record")).toEqual({
      badge: null,
      caption: null,
    });
  });
});
