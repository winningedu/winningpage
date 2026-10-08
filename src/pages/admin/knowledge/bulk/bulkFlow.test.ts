import { describe, expect, it } from "vitest";

import {
  type BulkAction,
  type BulkState,
  bulkReducer,
  INITIAL_BULK_STATE,
  isBulkBusy,
} from "./bulkFlow";
import type { KnowledgeParseResult } from "./xlsx";

const parse: KnowledgeParseResult = {
  inserts: [{ rowNo: 2, id: null, values: { title: "가" } }],
  updates: [],
  errors: [],
} as unknown as KnowledgeParseResult;

const dedupe = new Map([[2, { rowNo: 2, exact: [], near: [] }]]);

const parsed: BulkState = {
  phase: "parsed",
  parse,
  selected: new Set([2]),
  error: "",
};

const checked: BulkState = {
  phase: "checked",
  parse,
  selected: new Set([2]),
  dedupe,
  error: "",
};

describe("bulkReducer", () => {
  it("처음 상태에서 파일 파싱이 끝나면 parsed 로 간다", () => {
    const next = bulkReducer(INITIAL_BULK_STATE, {
      type: "fileParsed",
      parse,
      selected: new Set([2]),
    });

    expect(next).toEqual<BulkState>({
      phase: "parsed",
      parse,
      selected: new Set([2]),
      error: "",
    });
  });

  it("중복 검사를 시작하면 checking 으로 가고 진행 문구를 갱신하다가 끝나면 checked 로 간다", () => {
    const checking = bulkReducer(parsed, {
      type: "dedupeStarted",
      progress: "중복 검사 중 0 / 1행",
    });
    expect(checking).toMatchObject({
      phase: "checking",
      progress: "중복 검사 중 0 / 1행",
      dedupe: null,
    });

    const progressed = bulkReducer(checking, {
      type: "progress",
      text: "중복 검사 중 1 / 1행",
    });
    expect(progressed).toMatchObject({ progress: "중복 검사 중 1 / 1행" });

    const checked = bulkReducer(progressed, {
      type: "dedupeSucceeded",
      dedupe,
      selected: new Set(),
    });
    expect(checked).toEqual<BulkState>({
      phase: "checked",
      parse,
      selected: new Set(),
      dedupe,
      error: "",
    });
  });

  it("첫 중복 검사가 실패하면 parsed 로 돌아가 오류를 보여 준다", () => {
    const checking = bulkReducer(parsed, {
      type: "dedupeStarted",
      progress: "",
    });

    expect(
      bulkReducer(checking, { type: "dedupeFailed", message: "실패" }),
    ).toEqual<BulkState>({ ...parsed, error: "실패" } as BulkState);
  });

  it("다시 한 중복 검사가 실패하면 직전 결과를 둔 채 checked 로 돌아가 오류를 보여 준다", () => {
    const checking = bulkReducer(checked, {
      type: "dedupeStarted",
      progress: "",
    });

    expect(
      bulkReducer(checking, { type: "dedupeFailed", message: "실패" }),
    ).toEqual<BulkState>({ ...checked, error: "실패" } as BulkState);
  });

  it("parsed 와 checked 에서 행 체크를 켜고 끈다", () => {
    const off = bulkReducer(checked, { type: "toggle", rowNo: 2 });
    expect(off).toMatchObject({ phase: "checked", selected: new Set() });

    const on = bulkReducer({ ...parsed, selected: new Set() } as BulkState, {
      type: "toggle",
      rowNo: 2,
    });
    expect(on).toMatchObject({ phase: "parsed", selected: new Set([2]) });
  });

  it("checked 에서 반영을 시작하면 applying 으로 가고 끝나면 done 으로 가 완료 문구를 남긴다", () => {
    const applying = bulkReducer(checked, {
      type: "applyStarted",
      progress: "반영 중 0 / 1행",
    });
    expect(applying).toMatchObject({
      phase: "applying",
      progress: "반영 중 0 / 1행",
    });

    const embedding = bulkReducer(applying, {
      type: "progress",
      text: "임베딩 중",
    });
    expect(embedding).toMatchObject({
      phase: "applying",
      progress: "임베딩 중",
    });

    expect(
      bulkReducer(embedding, { type: "applySucceeded", message: "반영 완료" }),
    ).toEqual<BulkState>({ phase: "done", message: "반영 완료" });
  });

  it("반영이 실패하면 검사 결과와 선택을 둔 채 checked 로 돌아가 오류를 보여 준다", () => {
    const applying = bulkReducer(checked, {
      type: "applyStarted",
      progress: "",
    });

    expect(
      bulkReducer(applying, { type: "applyFailed", message: "반영 실패" }),
    ).toEqual<BulkState>({ ...checked, error: "반영 실패" } as BulkState);
  });

  it("파일을 읽기 시작하면 남은 안내를 지우고, 읽지 못하면 error 로 가 사유를 남긴다", () => {
    const done: BulkState = { phase: "done", message: "반영 완료" };

    const reading = bulkReducer(done, { type: "fileStarted" });
    expect(reading).toEqual<BulkState>({ phase: "idle" });

    expect(
      bulkReducer(reading, { type: "fileFailed", message: "읽기 실패" }),
    ).toEqual<BulkState>({ phase: "error", message: "읽기 실패" });
  });

  it("미리보기를 닫으면 오류가 없을 때는 idle 로, 오류가 있으면 그 문구를 남긴 error 로 간다", () => {
    expect(bulkReducer(parsed, { type: "close" })).toEqual<BulkState>({
      phase: "idle",
    });
    expect(
      bulkReducer({ ...checked, error: "반영 실패" } as BulkState, {
        type: "close",
      }),
    ).toEqual<BulkState>({ phase: "error", message: "반영 실패" });
  });
});

const checking = bulkReducer(parsed, { type: "dedupeStarted", progress: "" });
const applying = bulkReducer(checked, { type: "applyStarted", progress: "" });
const done: BulkState = { phase: "done", message: "반영 완료" };
const failed: BulkState = { phase: "error", message: "읽기 실패" };
const idle = INITIAL_BULK_STATE;

const fileParsed: BulkAction = {
  type: "fileParsed",
  parse,
  selected: new Set([2]),
};
const dedupeSucceeded: BulkAction = {
  type: "dedupeSucceeded",
  dedupe,
  selected: new Set([2]),
};

describe("bulkReducer 허용 전이 표", () => {
  it.each<[string, BulkState, BulkAction, BulkState["phase"]]>([
    ["idle", idle, fileParsed, "parsed"],
    ["done", done, fileParsed, "parsed"],
    ["error", failed, fileParsed, "parsed"],
    ["idle", idle, { type: "fileFailed", message: "x" }, "error"],
    ["done", done, { type: "fileStarted" }, "idle"],
    ["error", failed, { type: "fileStarted" }, "idle"],
    ["parsed", parsed, { type: "dedupeStarted", progress: "" }, "checking"],
    ["checked", checked, { type: "dedupeStarted", progress: "" }, "checking"],
    ["checking", checking, dedupeSucceeded, "checked"],
    ["checking", checking, { type: "dedupeFailed", message: "x" }, "parsed"],
    ["checking", checking, { type: "progress", text: "x" }, "checking"],
    ["parsed", parsed, { type: "toggle", rowNo: 2 }, "parsed"],
    ["checked", checked, { type: "toggle", rowNo: 2 }, "checked"],
    ["checked", checked, { type: "applyStarted", progress: "" }, "applying"],
    ["applying", applying, { type: "progress", text: "x" }, "applying"],
    ["applying", applying, { type: "applySucceeded", message: "x" }, "done"],
    ["applying", applying, { type: "applyFailed", message: "x" }, "checked"],
    ["parsed", parsed, { type: "close" }, "idle"],
    ["checked", checked, { type: "close" }, "idle"],
  ])("%s 에서 %j 를 받으면 %s 로 간다", (_from, state, action, phase) => {
    expect(bulkReducer(state, action).phase).toBe(phase);
  });
});

describe("bulkReducer 금지 전이 표", () => {
  it.each<[string, BulkState, BulkAction]>([
    ["checking", checking, { type: "close" }],
    ["applying", applying, { type: "close" }],
    ["checking", checking, { type: "fileStarted" }],
    ["applying", applying, fileParsed],
    ["applying", applying, { type: "fileFailed", message: "x" }],
    ["checking", checking, { type: "toggle", rowNo: 2 }],
    ["applying", applying, { type: "toggle", rowNo: 2 }],
    ["checking", checking, { type: "dedupeStarted", progress: "" }],
    ["applying", applying, { type: "dedupeStarted", progress: "" }],
    ["checking", checking, { type: "applyStarted", progress: "" }],
    ["idle", idle, { type: "dedupeStarted", progress: "" }],
    ["done", done, { type: "dedupeStarted", progress: "" }],
    ["parsed", parsed, { type: "applyStarted", progress: "" }],
    [
      "선택 0행 checked",
      { ...checked, selected: new Set() } as BulkState,
      { type: "applyStarted", progress: "" },
    ],
    ["idle", idle, { type: "applyStarted", progress: "" }],
    ["parsed", parsed, dedupeSucceeded],
    ["applying", applying, { type: "dedupeFailed", message: "x" }],
    ["checked", checked, { type: "applySucceeded", message: "x" }],
    ["checking", checking, { type: "applyFailed", message: "x" }],
    ["parsed", parsed, { type: "progress", text: "x" }],
    ["idle", idle, { type: "toggle", rowNo: 2 }],
    ["done", done, { type: "toggle", rowNo: 2 }],
    ["idle", idle, { type: "close" }],
    ["done", done, { type: "close" }],
    ["error", failed, { type: "close" }],
  ])("%s 에서 %j 는 상태를 그대로 둔다", (_from, state, action) => {
    expect(bulkReducer(state, action)).toBe(state);
  });
});

describe("isBulkBusy", () => {
  it("checking 과 applying 만 진행 중으로 본다", () => {
    expect(
      [idle, parsed, checking, checked, applying, done, failed].map(isBulkBusy),
    ).toEqual([false, false, true, false, true, false, false]);
  });
});
