// 엑셀 일괄 등록 패널의 단계 전이. 화면(BulkPanel.tsx)은 호출 순서만 들고,
// 지금 어느 단계이고 다음에 어디로 갈 수 있는지는 여기서 정한다.

import type { DedupeResult } from "../../../../../api/_lib/knowledge/dedupe.js";
import type { KnowledgeParseResult } from "./xlsx";

export type DedupeMap = ReadonlyMap<number, DedupeResult>;

type Draft = {
  parse: KnowledgeParseResult;
  selected: ReadonlySet<number>;
};

export type BulkState =
  | { phase: "idle" }
  | (Draft & { phase: "parsed"; error: string })
  /** 중복 검사 진행. 다시 검사할 때는 직전 결과를 계속 보여 준다. */
  | (Draft & { phase: "checking"; dedupe: DedupeMap | null; progress: string })
  | (Draft & { phase: "checked"; dedupe: DedupeMap; error: string })
  /** 반영과 임베딩 backfill 진행. */
  | (Draft & { phase: "applying"; dedupe: DedupeMap; progress: string })
  | { phase: "done"; message: string }
  /** 미리보기 밖에 남기는 오류. 파일을 읽지 못했거나 오류를 둔 채 미리보기를 닫았다. */
  | { phase: "error"; message: string };

export type BulkAction =
  | { type: "fileStarted" }
  | { type: "fileFailed"; message: string }
  | {
      type: "fileParsed";
      parse: KnowledgeParseResult;
      selected: ReadonlySet<number>;
    }
  | { type: "dedupeStarted"; progress: string }
  | { type: "progress"; text: string }
  | {
      type: "dedupeSucceeded";
      dedupe: DedupeMap;
      selected: ReadonlySet<number>;
    }
  | { type: "dedupeFailed"; message: string }
  | { type: "toggle"; rowNo: number }
  | { type: "applyStarted"; progress: string }
  | { type: "applySucceeded"; message: string }
  | { type: "applyFailed"; message: string }
  | { type: "close" };

export const INITIAL_BULK_STATE: BulkState = { phase: "idle" };

/** 서버 호출이 진행 중이라 버튼과 닫기를 막는 단계. */
export function isBulkBusy(state: BulkState): boolean {
  return state.phase === "checking" || state.phase === "applying";
}

export function bulkReducer(state: BulkState, action: BulkAction): BulkState {
  switch (action.type) {
    case "fileStarted":
      if (isBulkBusy(state)) return state;
      return { phase: "idle" };
    case "fileFailed":
      if (isBulkBusy(state)) return state;
      return { phase: "error", message: action.message };
    case "fileParsed":
      if (isBulkBusy(state)) return state;
      return {
        phase: "parsed",
        parse: action.parse,
        selected: action.selected,
        error: "",
      };
    case "dedupeStarted":
      if (state.phase !== "parsed" && state.phase !== "checked") return state;
      return {
        phase: "checking",
        parse: state.parse,
        selected: state.selected,
        dedupe: state.phase === "checked" ? state.dedupe : null,
        progress: action.progress,
      };
    case "progress":
      if (state.phase !== "checking" && state.phase !== "applying")
        return state;
      return { ...state, progress: action.text };
    case "dedupeSucceeded":
      if (state.phase !== "checking") return state;
      return {
        phase: "checked",
        parse: state.parse,
        selected: action.selected,
        dedupe: action.dedupe,
        error: "",
      };
    case "dedupeFailed": {
      if (state.phase !== "checking") return state;
      const { parse, selected, dedupe } = state;
      if (dedupe)
        return {
          phase: "checked",
          parse,
          selected,
          dedupe,
          error: action.message,
        };
      return { phase: "parsed", parse, selected, error: action.message };
    }
    case "toggle":
      if (state.phase !== "parsed" && state.phase !== "checked") return state;
      return { ...state, selected: toggled(state.selected, action.rowNo) };
    case "applyStarted":
      if (state.phase !== "checked" || state.selected.size === 0) return state;
      return {
        phase: "applying",
        parse: state.parse,
        selected: state.selected,
        dedupe: state.dedupe,
        progress: action.progress,
      };
    case "applySucceeded":
      if (state.phase !== "applying") return state;
      return { phase: "done", message: action.message };
    case "applyFailed":
      if (state.phase !== "applying") return state;
      return {
        phase: "checked",
        parse: state.parse,
        selected: state.selected,
        dedupe: state.dedupe,
        error: action.message,
      };
    case "close":
      if (state.phase !== "parsed" && state.phase !== "checked") return state;
      if (state.error) return { phase: "error", message: state.error };
      return { phase: "idle" };
  }
}

function toggled(selected: ReadonlySet<number>, rowNo: number) {
  const next = new Set(selected);
  if (next.has(rowNo)) next.delete(rowNo);
  else next.add(rowNo);
  return next;
}
