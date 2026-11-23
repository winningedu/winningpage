import { describe, expect, it, vi } from "vitest";
import type { BuildInput, ReportRecord } from "./inputs.js";
import {
  type LoadedInput,
  type ReportStore,
  runReport,
  type StoredReport,
} from "./run.js";
import { sampleInput } from "./sample.testkit.js";

function memoryStore(initial: StoredReport | null = null) {
  const state = { row: initial, claims: 0, busy: false };
  const store: ReportStore = {
    read: async () => state.row,
    claim: async () => {
      if (state.busy) return false;
      state.claims++;
      return true;
    },
    finish: async (_c, row) => {
      state.row = row;
      return true;
    },
  };
  return { state, store };
}

const loaded = (over: Partial<BuildInput> = {}, rev = 1): LoadedInput => {
  const { tagMap: _t, ...rest } = sampleInput(over);
  return { input: rest, finalRevision: rev };
};

const now = () => "2026-11-23T00:00:00.000Z";

// 요청된 항목마다 근거 원문 첫 글자들로 안전한 문장을 만들어 사실 대조를 통과시킨다.
function okModel() {
  return vi.fn(async (_system: string, user: string) => {
    const blocks = user
      .split(/\n\n(?=\[)/)
      .filter((b) => /^\[[^\]]+\]\n/.test(b));
    const items = blocks.map((b) => {
      const id = /^\[([^\]]+)\]/.exec(b)?.[1] as string;
      const tag = /꼬리표 ([PDAH]\d+)/.exec(b)?.[1];
      return {
        id,
        text: tag ? `기록 내용을 정리함 ${tag}.` : "기록 내용을 정리함.",
      };
    });
    return { text: JSON.stringify({ items }), finishReason: "STOP" };
  });
}

const badModel = () =>
  vi.fn(async () => ({
    text: JSON.stringify({
      items: [{ id: "relation:P1", text: "숫자 987% 증가." }],
    }),
    finishReason: "STOP",
  }));

const deps = (
  store: ReportStore,
  model: ReturnType<typeof okModel>,
  load: () => Promise<LoadedInput | null> = async () => loaded(),
) => ({
  sessionId: "s1",
  load,
  store,
  callStructured: model as never,
  now,
});

describe("runReport", () => {
  it("builds the report after finalize with one model call and stores it as ready", async () => {
    const { state, store } = memoryStore();
    const model = okModel();
    const out = await runReport(deps(store, model));
    expect(out.kind).toBe("ok");
    expect(model).toHaveBeenCalledTimes(1);
    expect(state.row).toMatchObject({
      finalRevision: 1,
      status: "ready",
      attempts: 1,
    });
    expect(state.row?.payload?.composeMissing).toBe(false);
    expect(state.row?.tagMap.P1).toBe("rec-p1");
    expect(state.row?.payload?.ch03.rows[0]?.explanation).toBe(
      "기록 내용을 정리함.",
    );
  });

  it("returns the stored report for the same final revision without another model call", async () => {
    const { store } = memoryStore();
    const model = okModel();
    await runReport(deps(store, model));
    const again = await runReport(deps(store, model));
    expect(again).toMatchObject({ kind: "ok", reused: true });
    expect(model).toHaveBeenCalledTimes(1);
  });

  it("builds with code values only after two failed replies and offers a rebuild later", async () => {
    const { state, store } = memoryStore();
    const model = badModel();
    const out = await runReport(deps(store, model as never));
    expect(out.kind).toBe("ok");
    expect(model).toHaveBeenCalledTimes(2);
    expect(state.row).toMatchObject({ status: "ready", attempts: 2 });
    expect(state.row?.payload?.composeMissing).toBe(true);
    expect(state.row?.payload?.ch03.rows[0]?.explanation).toBeNull();
    expect(state.row?.payload?.ch02.subjects[0]?.rows[0]?.dots).toBe(4);

    const good = okModel();
    const again = await runReport(deps(store, good));
    expect(again).toMatchObject({ kind: "ok", reused: false });
    expect(state.row?.payload?.composeMissing).toBe(false);
    expect(state.row?.attempts).toBe(3);
  });

  it("keeps the fixed tag numbers when rebuilding the same final revision", async () => {
    const { state, store } = memoryStore();
    await runReport(deps(store, badModel() as never));
    const first = { ...state.row?.tagMap };
    const earlier = {
      ...(sampleInput().records[0] as ReportRecord),
      id: "rec-early",
      subject: "수학",
      submittedAt: "2026-04-01T00:00:00.000Z",
    };
    await runReport(
      deps(store, okModel(), async () =>
        loaded({ records: [...sampleInput().records, earlier] }),
      ),
    );
    expect(state.row?.tagMap).toMatchObject(first);
    expect(state.row?.tagMap.P6).toBe("rec-early");
  });

  it("starts fresh with a new final revision", async () => {
    const { state, store } = memoryStore();
    await runReport(deps(store, badModel() as never));
    await runReport(deps(store, okModel(), async () => loaded({}, 2)));
    expect(state.row).toMatchObject({ finalRevision: 2, attempts: 1 });
  });

  it("does not call the model when another request holds the report", async () => {
    const { state, store } = memoryStore();
    state.busy = true;
    const model = okModel();
    expect(await runReport(deps(store, model))).toEqual({ kind: "busy" });
    expect(model).not.toHaveBeenCalled();
  });

  it("reports a missing final body and does not store anything", async () => {
    const { state, store } = memoryStore();
    expect(await runReport(deps(store, okModel(), async () => null))).toEqual({
      kind: "no_final",
    });
    expect(state.row).toBeNull();
  });

  it("stores failed on a hard failure and keeps a good report that already exists", async () => {
    const broken = async (): Promise<LoadedInput> =>
      loaded({ session: { ...sampleInput().session, subject: null } });
    const empty = memoryStore();
    expect((await runReport(deps(empty.store, okModel(), broken))).kind).toBe(
      "failed",
    );
    expect(empty.state.row).toMatchObject({ status: "failed", payload: null });

    const kept = memoryStore();
    await runReport(deps(kept.store, badModel() as never));
    const before = kept.state.row?.payload;
    expect((await runReport(deps(kept.store, okModel(), broken))).kind).toBe(
      "failed",
    );
    expect(kept.state.row?.status).toBe("ready");
    expect(kept.state.row?.payload).toEqual(before);
  });

  it("never writes building when a same revision placeholder hits a hard failure", async () => {
    const broken = async (): Promise<LoadedInput> =>
      loaded({ session: { ...sampleInput().session, subject: null } });
    const placeholder: StoredReport = {
      sessionId: "s1",
      finalRevision: 1,
      payload: null,
      tagMap: {},
      status: "building",
      attempts: 0,
      builtAt: now(),
    };
    const { state, store } = memoryStore(placeholder);
    expect((await runReport(deps(store, okModel(), broken))).kind).toBe(
      "failed",
    );
    expect(state.row).toMatchObject({ status: "failed", payload: null });
  });

  it("fails without storing when the inputs cannot be read", async () => {
    const { state, store } = memoryStore();
    const boom = async () => {
      throw new Error("db down");
    };
    expect((await runReport(deps(store, okModel(), boom))).kind).toBe("failed");
    expect(state.row).toBeNull();
  });

  it("stops asking the model once the report used 10 attempts", async () => {
    const { state, store } = memoryStore();
    await runReport(deps(store, badModel() as never));
    (state.row as StoredReport).attempts = 10;
    const model = okModel();
    await runReport(deps(store, model));
    expect(model).not.toHaveBeenCalled();
    expect(state.row?.payload?.composeMissing).toBe(true);
    expect(state.row?.attempts).toBe(10);
  });
});
