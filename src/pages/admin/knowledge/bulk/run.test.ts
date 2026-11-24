import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DedupeResult } from "../../../../../api/_lib/knowledge/dedupe.js";
import type { BulkAction } from "./flow";
import { runApply, runDedupe } from "./run";
import type { KnowledgeParseResult } from "./xlsx";

const parse = {
  inserts: [{ rowNo: 2, id: null, values: { title: "가", content: "내용" } }],
  updates: [],
  errors: [],
} as unknown as KnowledgeParseResult;

const postKnowledgeDedupe =
  vi.fn<(...args: unknown[]) => Promise<DedupeResult[]>>();
const postKnowledgeBulk =
  vi.fn<() => Promise<{ inserted: number; updated: number; ids: string[] }>>();
const postEmbedBackfill =
  vi.fn<() => Promise<{ embedded: number; failed: number }>>();

function lastAction(dispatch: ReturnType<typeof vi.fn>): BulkAction {
  return dispatch.mock.calls.at(-1)?.[0] as BulkAction;
}

beforeEach(() => {
  vi.resetAllMocks();
});

const dedupeDeps = { dedupe: postKnowledgeDedupe };
const applyDeps = { bulk: postKnowledgeBulk, backfill: postEmbedBackfill };

describe("runDedupe", () => {
  it("검사 호출이 실패하면 이전과 같은 접두어를 붙여 dedupeFailed 를 보낸다", async () => {
    postKnowledgeDedupe.mockRejectedValue(new Error("Failed to fetch"));
    const dispatch = vi.fn();

    await runDedupe({
      knowledgeType: "topic_pattern",
      parse,
      dispatch,
      ...dedupeDeps,
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "dedupeStarted",
      progress: "중복 검사 중 0 / 1행",
    });
    expect(lastAction(dispatch)).toEqual({
      type: "dedupeFailed",
      message: "중복 검사에 실패했습니다: Failed to fetch",
    });
  });
});

describe("runDedupe 성공", () => {
  it("결과를 행 번호로 모으고 정확 일치 행을 뺀 기본 선택으로 dedupeSucceeded 를 보낸다", async () => {
    const exact = { rowNo: 2, exact: [{ id: "x", title: "가" }], near: [] };
    postKnowledgeDedupe.mockResolvedValue([exact]);
    const dispatch = vi.fn();

    await runDedupe({
      knowledgeType: "topic_pattern",
      parse,
      dispatch,
      ...dedupeDeps,
    });

    expect(lastAction(dispatch)).toEqual({
      type: "dedupeSucceeded",
      dedupe: new Map([[2, exact]]),
      selected: new Set(),
    });
  });
});

describe("runApply", () => {
  const selected = new Set([2]);

  it("임베딩 호출이 실패하면 목록을 다시 읽고 반영 건수를 담은 이전 문구로 applyFailed 를 보낸다", async () => {
    postKnowledgeBulk.mockResolvedValue({
      inserted: 1,
      updated: 0,
      ids: ["a"],
    });
    postEmbedBackfill.mockRejectedValue(new Error("임베딩 키가 없습니다."));
    const dispatch = vi.fn();
    const onReload = vi.fn();

    await runApply({
      knowledgeType: "topic_pattern",
      parse,
      selected,
      dispatch,
      onReload,
      ...applyDeps,
    });

    expect(onReload).toHaveBeenCalledTimes(1);
    expect(lastAction(dispatch)).toEqual({
      type: "applyFailed",
      message:
        "반영에 실패했습니다. 이미 반영된 묶음은 되돌려지지 않습니다(신규 1건, 수정 0건 반영됨): 임베딩 키가 없습니다.",
    });
  });

  it("반영 호출이 실패하면 임베딩을 부르지 않고 applyFailed 를 보낸다", async () => {
    postKnowledgeBulk.mockRejectedValue(
      new Error("요청에 실패했습니다. (HTTP 500)"),
    );
    const dispatch = vi.fn();
    const onReload = vi.fn();

    await runApply({
      knowledgeType: "topic_pattern",
      parse,
      selected,
      dispatch,
      onReload,
      ...applyDeps,
    });

    expect(postEmbedBackfill).not.toHaveBeenCalled();
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(lastAction(dispatch)).toEqual({
      type: "applyFailed",
      message:
        "반영에 실패했습니다. 이미 반영된 묶음은 되돌려지지 않습니다(신규 0건, 수정 0건 반영됨): 요청에 실패했습니다. (HTTP 500)",
    });
  });

  it("끝까지 성공하면 진행 문구를 차례로 알리고 임베딩 실패 안내를 붙인 완료 문구로 applySucceeded 를 보낸다", async () => {
    postKnowledgeBulk.mockResolvedValue({
      inserted: 1,
      updated: 0,
      ids: ["a"],
    });
    postEmbedBackfill
      .mockResolvedValueOnce({ embedded: 1, failed: 0 })
      .mockResolvedValueOnce({ embedded: 0, failed: 2 });
    const dispatch = vi.fn();
    const onReload = vi.fn();

    await runApply({
      knowledgeType: "topic_pattern",
      parse,
      selected,
      dispatch,
      onReload,
      ...applyDeps,
    });

    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
      { type: "applyStarted", progress: "반영 중 0 / 1행" },
      { type: "progress", text: "반영 중 0 / 1행" },
      { type: "progress", text: "임베딩 중" },
      { type: "progress", text: "임베딩 중 1건 완료 (1회차)" },
      {
        type: "applySucceeded",
        message:
          "반영 완료: 신규 1건, 수정 0건, 임베딩 1건. 임베딩 실패 2건은 목록에서 사유를 확인하세요.",
      },
    ]);
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
