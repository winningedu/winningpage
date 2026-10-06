// intake/extractOutcome.ts 의 추출 결과 조립을 확인한다.

import { describe, expect, test } from "vitest";
import {
  buildExtractOutcome,
  decideExtractionMode,
  EXTRACT_BUDGET_MS,
  exceedsUploadLimit,
  remainingBudgetMs,
  toActivityView,
} from "./extractOutcome.js";

const UPLOAD_ID = "98af95da-47bf-4cee-8a2e-7d70d07fb1c9";

describe("decideExtractionMode", () => {
  test("text 는 text, binary 는 vision, unsupported 는 unsupported", () => {
    expect(decideExtractionMode({ kind: "text", text: "x" })).toBe("text");
    expect(decideExtractionMode({ kind: "binary" })).toBe("vision");
    expect(decideExtractionMode({ kind: "unsupported" })).toBe("unsupported");
  });
});

describe("buildExtractOutcome", () => {
  const ctx = {
    uploadId: UPLOAD_ID,
    profileId: "p1",
    fileName: "a.pdf",
    gradeLabel: "고1",
    semester: 2,
    now: "2026-10-06T00:00:00.000Z",
  };
  const extracted = {
    topic: "주제",
    concept: null,
    result: "결과",
    limitation: null,
  };

  test("추출 성공이면 ok 갱신, 활동 행, 응답을 만든다", () => {
    const o = buildExtractOutcome({ ok: true, extracted }, ctx);
    expect(o.uploadUpdate).toEqual({
      extraction_status: "ok",
      extracted,
      updated_at: ctx.now,
    });
    expect(o.activityRow).toMatchObject({
      profile_id: "p1",
      source_program: "upload",
      source_ref_id: UPLOAD_ID,
      status: "draft",
      topic: "주제",
    });
    expect(o.response).toEqual({
      ok: true,
      uploadId: UPLOAD_ID,
      status: "ok",
      extracted,
    });
  });

  test("추출 실패면 failed 갱신과 사유 응답을 만들고 활동 행은 없다", () => {
    const o = buildExtractOutcome({ ok: false, reason: "JSON 파싱 실패" }, ctx);
    expect(o.uploadUpdate).toEqual({
      extraction_status: "failed",
      extraction_error: "JSON 파싱 실패",
      updated_at: ctx.now,
    });
    expect(o.activityRow).toBeNull();
    expect(o.response).toEqual({
      ok: true,
      uploadId: UPLOAD_ID,
      status: "failed",
      error: "JSON 파싱 실패",
    });
  });
});

describe("toActivityView", () => {
  test("planned 를 빼고 응답용 키로 바꾼다", () => {
    const base = {
      grade_label: "고1" as const,
      semester: 1 as const,
      subject_group: "수학",
      subject: "수학I",
      topic: "함수",
    };
    const out = toActivityView([
      {
        id: "a",
        source_program: "self" as const,
        status: "draft" as const,
        ...base,
      },
      {
        id: "b",
        source_program: "manual" as const,
        status: "planned" as const,
        ...base,
      },
    ]);
    expect(out).toEqual([
      {
        id: "a",
        source: "self",
        status: "draft",
        gradeLabel: "고1",
        semester: 1,
        subjectGroup: "수학",
        subject: "수학I",
        topic: "함수",
      },
    ]);
  });
});

describe("remainingBudgetMs", () => {
  test("시작 시각에서 총 예산을 뺀 남은 시간을 돌려준다", () => {
    expect(remainingBudgetMs(1000, 11000)).toBe(40000);
  });
  test("마감이 지났으면 0 이다", () => {
    expect(remainingBudgetMs(0, 60000)).toBe(0);
  });
  test("총 예산을 지정하면 그 값을 쓴다", () => {
    expect(remainingBudgetMs(0, 1000, 5000)).toBe(4000);
  });
  test("기본 예산은 50초다", () => {
    expect(EXTRACT_BUDGET_MS).toBe(50_000);
  });
});

describe("exceedsUploadLimit", () => {
  const row = (
    i: number,
    status: "pending" | "processing" | "ok" | "failed",
    grade: "고1" | "고2" = "고1",
    semester: 1 | 2 = 1,
  ) => ({
    id: `u${i}`,
    grade_label: grade,
    semester,
    extraction_status: status,
  });

  test("같은 학기 failed 제외 건수가 10 이하면 넘지 않는다", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(i, "ok"));
    expect(exceedsUploadLimit(rows, "고1", 1)).toBe(false);
  });
  test("11개째가 되면 넘는다", () => {
    const rows = Array.from({ length: 11 }, (_, i) => row(i, "pending"));
    expect(exceedsUploadLimit(rows, "고1", 1)).toBe(true);
  });
  test("failed 와 다른 학기 행은 세지 않는다", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => row(i, "ok")),
      row(20, "failed"),
      row(21, "ok", "고2"),
      row(22, "ok", "고1", 2),
    ];
    expect(exceedsUploadLimit(rows, "고1", 1)).toBe(false);
  });
});
