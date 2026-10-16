// 설계 리포트 핸들러가 성장설계 수신값을 읽는 조건 테스트.
// 세션의 growth_report_id 가 비어 있어도 완료 회차가 있으면 수신값이 프롬프트 입력에 들어가야 한다.
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadHandoffView = vi.fn();
const loadSession = vi.fn();
const buildDesignInputSpy = vi.fn();
const runGeneration = vi.fn();

const SID = "123e4567-e89b-12d3-a456-426614174000";
const TID = "223e4567-e89b-12d3-a456-426614174000";

vi.mock("../_lib/handler.js", () => ({
  defineHandler: (opts: { handler: unknown }) => opts.handler,
  requireUserId: (ctx: { userId: string }) => ctx.userId,
}));
vi.mock("../_lib/ai/gemini.js", () => ({ callStructured: vi.fn() }));
vi.mock("../_lib/inquiry/compose.js", () => ({
  fail: vi.fn(),
  loadAssetViews: vi.fn(async () => []),
  loadHandoffView: (...a: unknown[]) => loadHandoffView(...a),
  loadSessionParts: vi.fn(),
  NO_ENTITLEMENT_MESSAGE: "x",
  SESSION_NOT_FOUND_MESSAGE: "x",
}));
vi.mock("../_lib/inquiry/db.js", () => ({
  loadDesignReport: vi.fn(),
  loadLatestRoundTopics: vi.fn(async () => [{ id: TID }]),
  loadPlanItem: vi.fn(),
  loadRecordsByIds: vi.fn(async () => []),
  loadSession: (...a: unknown[]) => loadSession(...a),
  loadTopic: vi.fn(),
}));
vi.mock("../_lib/inquiry/generate.js", () => ({
  generationErrorOf: () => ({
    status: 500,
    code: "X",
    message: "m",
    extra: undefined,
  }),
  retryNotesFor: vi.fn(),
  runGeneration: (...a: unknown[]) => runGeneration(...a),
}));
vi.mock("../_lib/inquiry/generateDb.js", () => ({
  consumeCredit: vi.fn(),
  markSessionInProgress: vi.fn(),
  saveDesign: vi.fn(),
}));
vi.mock("../_lib/inquiry/views.js", async (importActual) => {
  const actual =
    await importActual<typeof import("../_lib/inquiry/views.js")>();
  return { ...actual, toTopicView: (row: unknown) => row };
});
vi.mock("../_lib/inquiry/designFlow.js", async (importActual) => {
  const actual =
    await importActual<typeof import("../_lib/inquiry/designFlow.js")>();
  return {
    ...actual,
    buildDesignInput: (...a: unknown[]) => {
      buildDesignInputSpy(...a);
      return { primaryAsset: { reliability: "A" } };
    },
    designValidator: vi.fn(),
  };
});
vi.mock("../_lib/inquiry/prompts.js", () => ({
  buildDesignPrompt: vi.fn(() => "prompt"),
}));

const handler = (await import("./plan-report.js")).default as unknown as (
  req: unknown,
  res: unknown,
  ctx: unknown,
) => Promise<void>;

const sessionRow = {
  id: SID,
  status: "in_progress",
  grade_label: "고2",
  semester: 1,
  career: "의사",
  subject: "생명과학",
  growth_report_id: null,
  plan_item_id: null,
  reply_pending: false,
  selected_topic_id: null,
  design_report_id: null,
  latest_evaluation_id: null,
  final_report_id: null,
  generation_state: {},
  topic_round_count: 1,
  evaluation_count: 0,
  last_activity_at: "2026-10-06T00:00:00.000Z",
  completed_at: null,
};

const HANDOFF = { marker: "handoff" };

async function run() {
  await handler(
    { body: { sessionId: SID, topicId: TID } },
    { status: () => ({ json: vi.fn() }) },
    { userId: "u1", supabaseAdmin: {} },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  loadSession.mockResolvedValue(sessionRow);
  runGeneration.mockResolvedValue({ kind: "validation_failed" });
});

describe("plan-report 성장설계 수신값", () => {
  it("세션 growth_report_id 가 null 이어도 완료 회차가 있으면 수신값이 입력에 들어간다", async () => {
    loadHandoffView.mockResolvedValue(HANDOFF);
    await run();
    expect(loadHandoffView).toHaveBeenCalledTimes(1);
    expect(buildDesignInputSpy).toHaveBeenCalledWith(
      expect.objectContaining({ handoff: HANDOFF }),
    );
  });

  it("완료 회차가 없으면 수신값 없이 진행한다", async () => {
    loadHandoffView.mockResolvedValue(null);
    await run();
    expect(buildDesignInputSpy).toHaveBeenCalledWith(
      expect.objectContaining({ handoff: null }),
    );
  });
});
