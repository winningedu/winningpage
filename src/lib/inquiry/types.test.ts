import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, expectTypeOf, test } from "vitest";
import type {
  ActivityFields,
  EvaluateRequest,
  EvaluateResponse,
  FinalizeRequest,
  FinalizeResponse,
  GenerationFailureExtra,
  PlanReportRequest,
  PlanReportResponse,
  RecommendRequest,
  RecommendResponse,
  SessionRequest,
  TopicView,
} from "./types";

const SERVER = resolve(process.cwd(), "api/_lib/inquiry/types.ts");
const CLIENT = resolve(process.cwd(), "src/lib/inquiry/types.ts");

/** `export type Name = ...;` 한 선언을 공백 정규화해 꺼낸다. 주석은 뺀다. */
function declaration(source: string, name: string): string | null {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const match = new RegExp(`export type ${name} =([\\s\\S]*?);`).exec(stripped);
  return match ? (match[1] ?? "").replace(/\s+/g, " ").trim() : null;
}

const MIRRORED_UNIONS = [
  "SessionStatus",
  "ScreenStep",
  "GradeLabel",
  "Semester",
  "Stage",
  "LinkKind",
  "LinkageType",
  "Fit",
  "Reliability",
  "AssetKind",
  "GenerationMode",
  "ResponseStatus",
  "SectionId",
  "SectionGroup",
  "RubricItemId",
  "Level",
  "CoreErrorId",
  "SubmissionLabel",
  "SourceStatus",
  "InterviewTaskType",
  "InterviewSourceType",
  "InterviewEnding",
] as const;

const MIRRORED_SHAPES = [
  "InterviewAnswers",
  "GapCandidate",
  "AssetInput",
  "RecordCandidate",
  "SubmissionSections",
  "TopicDetail",
  "SectionPlan",
  "SourceTableRow",
  "SearchPlanRow",
  "DesignReport",
  "RubricItemResult",
  "CoreErrorResult",
  "FixItem",
  "SourceCheck",
  "EvaluationReport",
  "ActivityFields",
] as const;

describe("서버 types.ts 미러", () => {
  const server = readFileSync(SERVER, "utf8");
  const client = readFileSync(CLIENT, "utf8");

  test.each(MIRRORED_UNIONS)("유니온 %s 는 서버와 글자가 같다", (name) => {
    const expected = declaration(server, name);
    expect(expected).not.toBeNull();
    expect(declaration(client, name)).toBe(expected);
  });

  test.each(MIRRORED_SHAPES)("타입 %s 는 서버와 글자가 같다", (name) => {
    const expected = declaration(server, name);
    expect(expected).not.toBeNull();
    expect(declaration(client, name)).toBe(expected);
  });
});

describe("P4 계약 타입", () => {
  test("요청과 응답 모양이 부록 계약과 맞는다", () => {
    expectTypeOf<RecommendRequest>().toEqualTypeOf<{
      sessionId: string;
      seedTopic?: string | null;
    }>();
    expectTypeOf<PlanReportRequest>().toEqualTypeOf<{
      sessionId: string;
      topicId: string;
    }>();
    expectTypeOf<EvaluateRequest>().toEqualTypeOf<{ sessionId: string }>();
    expectTypeOf<FinalizeRequest>().toEqualTypeOf<{
      sessionId: string;
      fields: ActivityFields;
    }>();
    expectTypeOf<RecommendResponse["topics"]>().toEqualTypeOf<TopicView[]>();
    expectTypeOf<PlanReportResponse>().toHaveProperty("design");
    expectTypeOf<EvaluateResponse>().toHaveProperty("evaluation");
    expectTypeOf<FinalizeResponse["status"]>().toEqualTypeOf<
      "completed" | "already_completed"
    >();
    expectTypeOf<FinalizeResponse["replySent"]>().toEqualTypeOf<
      boolean | null
    >();
    expectTypeOf<GenerationFailureExtra>().toHaveProperty("attempts");
    expectTypeOf<SessionRequest>().toMatchTypeOf<{ action: string }>();
  });
});
