import { describe, expect, test, vi } from "vitest";
import { buildReportFileName } from "./reportFileName";

describe("buildReportFileName — 학습진단 리포트 PDF 파일명", () => {
  test("이름·진단일이 있으면 요구 형식 그대로", () => {
    expect(
      buildReportFileName({
        studentName: "홍길동",
        diagnosedAt: "2026-08-22T03:15:00.000Z",
      }),
    ).toBe("위닝에듀 학습진단리포트_홍길동학생_20260822");
  });

  test("날짜는 KST 기준 — UTC 자정 직전은 한국에서 다음 날", () => {
    expect(
      buildReportFileName({
        studentName: "홍길동",
        diagnosedAt: "2026-08-22T20:30:00.000Z",
      }),
    ).toBe("위닝에듀 학습진단리포트_홍길동학생_20260823");
  });

  test("이름이 없으면 이름 조각만 빠진다", () => {
    expect(
      buildReportFileName({
        studentName: "",
        diagnosedAt: "2026-08-22T03:15:00.000Z",
      }),
    ).toBe("위닝에듀 학습진단리포트_20260822");
  });

  test("진단일이 없거나 깨졌으면 날짜 조각만 빠진다", () => {
    expect(
      buildReportFileName({ studentName: " 홍길동 ", diagnosedAt: null }),
    ).toBe("위닝에듀 학습진단리포트_홍길동학생");
    expect(
      buildReportFileName({ studentName: "홍길동", diagnosedAt: "not-a-date" }),
    ).toBe("위닝에듀 학습진단리포트_홍길동학생");
  });

  test("둘 다 없으면 접두어만", () => {
    expect(buildReportFileName({})).toBe("위닝에듀 학습진단리포트");
  });
});

describe("buildReportFileName - 스쿨멘토", () => {
  test("접두어는 사이트 이름이다", async () => {
    vi.resetModules();
    vi.doMock("@/config/site", () => ({ site: { brandName: "스쿨멘토" } }));
    const { buildReportFileName: build } = await import("./reportFileName");

    expect(
      build({
        studentName: "홍길동",
        diagnosedAt: "2026-08-22T03:15:00.000Z",
      }),
    ).toBe("스쿨멘토 학습진단리포트_홍길동학생_20260822");
    vi.doUnmock("@/config/site");
    vi.resetModules();
  });
});
