import { describe, expect, it, vi } from "vitest";
import { embedSessionVectorNow } from "./instantEmbed.js";

type Row = { search_text: string | null; embedding_status: string } | null;

// performance_session_vectors 한 테이블만 흉내 내는 최소 가짜 클라이언트.
function fakeDb(opts: {
  row: Row;
  selectError?: { message: string } | null;
  updateError?: { message: string } | null;
  updatedRows?: number;
}) {
  const updates: Array<{
    patch: Record<string, unknown>;
    filters: Array<[string, unknown]>;
  }> = [];

  const db = {
    from(table: string) {
      expect(table).toBe("performance_session_vectors");
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: opts.row,
                  error: opts.selectError ?? null,
                }),
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          const entry = { patch, filters: [] as Array<[string, unknown]> };
          updates.push(entry);
          const chain = {
            eq(column: string, value: unknown) {
              entry.filters.push([column, value]);
              return chain;
            },
            select: async () => ({
              data: opts.updateError
                ? null
                : Array.from({ length: opts.updatedRows ?? 1 }, () => ({
                    session_id: "s1",
                  })),
              error: opts.updateError ?? null,
            }),
          };
          return chain;
        },
      };
    },
  };

  return { db: db as never, updates };
}

describe("embedSessionVectorNow", () => {
  it("pending 행을 임베딩하고 읽은 search_text 조건으로만 done 을 기록한다", async () => {
    const { db, updates } = fakeDb({
      row: { search_text: "학년: 고1", embedding_status: "pending" },
    });
    const embed = vi.fn(async () => [0.1, 0.2]);

    const result = await embedSessionVectorNow(db, "s1", { embed });

    expect(result).toEqual({ status: "embedded" });
    expect(embed).toHaveBeenCalledWith("학년: 고1", undefined);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.patch).toMatchObject({
      embedding: [0.1, 0.2],
      embedding_model: "gemini-embedding-2",
      embedding_status: "done",
      embedding_error: null,
    });
    expect(typeof updates[0]?.patch.embedded_at).toBe("string");
    expect(updates[0]?.filters).toEqual([
      ["session_id", "s1"],
      ["embedding_status", "pending"],
      ["search_text", "학년: 고1"],
    ]);
  });

  it("행이 없으면 임베딩 없이 skipped 를 돌려준다", async () => {
    const { db, updates } = fakeDb({ row: null });
    const embed = vi.fn(async () => [0.1]);

    const result = await embedSessionVectorNow(db, "s1", { embed });

    expect(result.status).toBe("skipped");
    expect(embed).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("이미 done 인 행은 임베딩 없이 skipped 를 돌려준다", async () => {
    const { db, updates } = fakeDb({
      row: { search_text: "학년: 고1", embedding_status: "done" },
    });
    const embed = vi.fn(async () => [0.1]);

    const result = await embedSessionVectorNow(db, "s1", { embed });

    expect(result.status).toBe("skipped");
    expect(embed).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("임베딩이 throw 하면 행을 건드리지 않고 failed 를 돌려준다", async () => {
    const { db, updates } = fakeDb({
      row: { search_text: "학년: 고1", embedding_status: "pending" },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const embed = vi.fn(async () => {
      throw new Error("Gemini 503");
    });

    const result = await embedSessionVectorNow(db, "s1", { embed });

    expect(result).toEqual({ status: "failed", reason: "Gemini 503" });
    expect(updates).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("저장 update 가 error 를 돌려주면 failed 를 돌려준다", async () => {
    const { db } = fakeDb({
      row: { search_text: "학년: 고1", embedding_status: "pending" },
      updateError: { message: "connection reset" },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await embedSessionVectorNow(db, "s1", {
      embed: async () => [0.1],
    });

    expect(result.status).toBe("failed");
    expect(result.reason).toContain("connection reset");
    warn.mockRestore();
  });

  it("조회가 error 를 돌려주면 임베딩 없이 failed 를 돌려준다", async () => {
    const { db } = fakeDb({
      row: null,
      selectError: { message: "timeout" },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const embed = vi.fn(async () => [0.1]);

    const result = await embedSessionVectorNow(db, "s1", { embed });

    expect(result.status).toBe("failed");
    expect(result.reason).toContain("timeout");
    expect(embed).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("조건부 update 가 0행이면 embedded 가 아니라 superseded 로 건너뛴다", async () => {
    const { db } = fakeDb({
      row: { search_text: "학년: 고1", embedding_status: "pending" },
      updatedRows: 0,
    });

    const result = await embedSessionVectorNow(db, "s1", {
      embed: async () => [0.1],
    });

    expect(result).toEqual({ status: "skipped", reason: "superseded" });
  });

  it("search_text 가 비어 있는 pending 행은 임베딩 없이 건너뛴다", async () => {
    const { db, updates } = fakeDb({
      row: { search_text: null, embedding_status: "pending" },
    });
    const embed = vi.fn(async () => [0.1]);

    const result = await embedSessionVectorNow(db, "s1", { embed });

    expect(result).toEqual({ status: "skipped", reason: "empty_search_text" });
    expect(embed).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });
});
