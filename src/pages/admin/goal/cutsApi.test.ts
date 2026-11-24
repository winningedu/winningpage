import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock("@/lib/http/client", () => ({ api: http }));

import {
  applyBackfill,
  fetchAllCutRows,
  fetchBackfillPreview,
  fetchCutsSummary,
  fetchJungsiMissing,
  postBulkRows,
} from "./cutsApi";

const reply = (body: unknown) => ({ json: async () => body });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchAllCutRows", () => {
  it("next 가 null 일 때까지 from 을 이어 받고 진행 수를 알린다", async () => {
    http.get
      .mockReturnValueOnce(reply({ items: [{ id: 1 }, { id: 2 }], next: 2 }))
      .mockReturnValueOnce(reply({ items: [{ id: 3 }], next: null }));
    const progress: { done: number; total: number }[] = [];

    const rows = await fetchAllCutRows(3, (p) => progress.push(p));

    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(http.get).toHaveBeenNthCalledWith(1, "goal/admin/cuts/rows", {
      searchParams: { from: 0 },
    });
    expect(http.get).toHaveBeenNthCalledWith(2, "goal/admin/cuts/rows", {
      searchParams: { from: 2 },
    });
    expect(progress).toEqual([
      { done: 2, total: 3 },
      { done: 3, total: 3 },
    ]);
  });
});

describe("요약과 정시 템플릿", () => {
  it("요약은 signal 과 함께 부른다", async () => {
    const summary = {
      total: 1,
      active: 1,
      normal: 1,
      special: 0,
      jungsi: 0,
      missing: 0,
      comboTotal: 1,
      comboNoJungsi: 1,
    };
    http.get.mockReturnValue(reply(summary));
    const signal = new AbortController().signal;
    expect(await fetchCutsSummary(signal)).toEqual(summary);
    expect(http.get).toHaveBeenCalledWith("goal/admin/cuts/summary", {
      signal,
    });
  });

  it("정시 컷 없는 조합 목록을 읽는다", async () => {
    http.get.mockReturnValue(
      reply({ items: [{ university_name: "나대", department_name: "영문" }] }),
    );
    expect(await fetchJungsiMissing()).toEqual([
      { university_name: "나대", department_name: "영문" },
    ]);
    expect(http.get).toHaveBeenCalledWith("goal/admin/cuts/jungsi-missing");
  });
});

describe("일괄 반영과 백필", () => {
  it("일괄 반영은 rows 본문으로 POST 한다", async () => {
    http.post.mockReturnValue(reply({ inserted: 1, updated: 0 }));
    await postBulkRows([{ cut_type: "normal" }] as never);
    expect(http.post).toHaveBeenCalledWith("goal/admin/cuts/bulk", {
      json: { rows: [{ cut_type: "normal" }] },
    });
  });

  it("백필 미리보기는 옵션을 searchParams 로, 반영은 본문으로 보낸다", async () => {
    const stats = {
      universityCount: 1,
      pairCount: 1,
      totalRows: 2,
      normalCount: 1,
      specialCount: 1,
      year2026Pairs: 1,
      year2025Pairs: 0,
      excludedStarPairs: 0,
      excludedEmptyPairs: 0,
      excludedNoTrackPairs: 0,
      mergedCount: 0,
      distribution: { min: 1, p25: 1, median: 1, p75: 1, max: 1 },
      samples: [],
    };
    http.get.mockReturnValue(
      reply({
        sourceRowCount: 2,
        stats,
        analysis: {
          overlapCount: 0,
          manualCount: 0,
          inactiveCount: 0,
          notedCount: 0,
          preservedCount: 0,
          nameAxisCount: 0,
        },
        applyCount: 2,
        orphanCount: 0,
      }),
    );
    const preview = await fetchBackfillPreview({
      yearMode: "prefer2026",
      preserveMode: "preserve",
    });
    expect(preview.applyCount).toBe(2);
    expect(http.get).toHaveBeenCalledWith("goal/admin/cuts/backfill", {
      searchParams: { yearMode: "prefer2026", preserveMode: "preserve" },
      timeout: false,
    });

    http.post.mockReturnValue(reply({ applied: 2, deactivated: 0 }));
    const body = {
      yearMode: "prefer2026" as const,
      preserveMode: "preserve" as const,
      orphanMode: "keep" as const,
      expectedApplyCount: 2,
      expectedOrphanCount: 0,
    };
    await applyBackfill(body);
    expect(http.post).toHaveBeenCalledWith("goal/admin/cuts/backfill", {
      json: body,
      timeout: false,
    });
  });
});
