import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/http/client", () => ({ api: http }));

import {
  createSectionRow,
  deleteSectionRow,
  fetchExportChunk,
  fetchSectionList,
  markSectionReviewed,
  sectionKeys,
  updateSectionMeta,
  updateSectionRow,
} from "./api";

const reply = (body: unknown) => ({ json: async () => body });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sectionKeys", () => {
  it("전량 섹션은 섹션 키만, 서버 페이지 섹션은 page 와 q 를 키에 싣는다", () => {
    expect(sectionKeys.list("notices")).toEqual([
      "admin",
      "sections",
      "notices",
    ]);
    expect(
      sectionKeys.list("admissionResults", { page: 2, q: "서울" }),
    ).toEqual([
      "admin",
      "sections",
      "admissionResults",
      { page: 2, q: "서울" },
    ]);
    expect(sectionKeys.section("notices")).toEqual([
      "admin",
      "sections",
      "notices",
    ]);
  });
});

describe("fetchSectionList", () => {
  it("페이지 없는 섹션은 쿼리 없이 부르고 signal 을 넘긴다", async () => {
    http.get.mockReturnValue(reply({ items: [{ id: 1 }], total: 1 }));
    const signal = new AbortController().signal;

    const result = await fetchSectionList("notices", undefined, signal);

    expect(http.get).toHaveBeenCalledWith("admin/sections/notices", {
      searchParams: {},
      signal,
    });
    expect(result).toEqual({ items: [{ id: 1 }], total: 1 });
  });

  it("서버 페이지 섹션은 page 와 q 를 보낸다", async () => {
    http.get.mockReturnValue(reply({ items: [], total: 0 }));

    await fetchSectionList("admissionResults", { page: 3, q: "서울" });

    expect(http.get).toHaveBeenCalledWith("admin/sections/admissionResults", {
      searchParams: { page: 3, q: "서울" },
    });
  });
});

describe("쓰기 요청", () => {
  it("등록은 POST 로 values 만 보낸다", async () => {
    http.post.mockReturnValue(reply({ id: "n1" }));

    const row = await createSectionRow("notices", { title: "a" });

    expect(http.post).toHaveBeenCalledWith("admin/sections/notices", {
      json: { values: { title: "a" } },
    });
    expect(row).toEqual({ id: "n1" });
  });

  it("수정은 PATCH, 메타 수정은 /meta 로 보낸다", async () => {
    http.patch.mockReturnValue(reply({ id: "n1" }));

    await updateSectionRow("notices", "n1", { title: "b" });
    await updateSectionMeta("admissionGuidelines", "g1", { title: "c" });

    expect(http.patch).toHaveBeenNthCalledWith(1, "admin/sections/notices/n1", {
      json: { values: { title: "b" } },
    });
    expect(http.patch).toHaveBeenNthCalledWith(
      2,
      "admin/sections/admissionGuidelines/g1/meta",
      { json: { values: { title: "c" } } },
    );
  });

  it("삭제는 DELETE, 검토 완료는 /reviewed POST 다", async () => {
    http.delete.mockResolvedValue(undefined);
    http.post.mockReturnValue(reply({ id: "k1" }));

    await deleteSectionRow("notices", "n1");
    await markSectionReviewed("knowledge", "k1");

    expect(http.delete).toHaveBeenCalledWith("admin/sections/notices/n1");
    expect(http.post).toHaveBeenCalledWith(
      "admin/sections/knowledge/k1/reviewed",
    );
  });
});

describe("fetchExportChunk", () => {
  it("from 과 q 를 보내고 items 와 next 를 돌려준다", async () => {
    http.get.mockReturnValue(reply({ items: [{ id: 1 }], next: 1000 }));

    const chunk = await fetchExportChunk("admissionResults", 0, "서울");

    expect(http.get).toHaveBeenCalledWith(
      "admin/sections/admissionResults/export",
      {
        searchParams: { from: 0, q: "서울" },
      },
    );
    expect(chunk).toEqual({ items: [{ id: 1 }], next: 1000 });
  });
});
